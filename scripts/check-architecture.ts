import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, 'src');
const LEGACY_ROOTS = ['artifacts', 'cli', 'contracts', 'environment', 'execution', 'flow-project', 'package-assets'];

const VAGUE_DIRECTORY_NAMES = new Set(['common', 'helpers', 'managers', 'misc', 'services', 'utils']);
const FORBIDDEN_DOMAIN_DEPENDENCIES = [
  '/application/',
  '/artifacts/',
  '/cli/',
  '/environment/',
  '/execution/',
  '/flow-project/',
  '/infrastructure/',
  '/package-assets/',
  '/presentation/'
];
const FORBIDDEN_APPLICATION_DEPENDENCIES = ['/cli/', '/presentation/'];
const FORBIDDEN_INFRASTRUCTURE_DEPENDENCIES = ['/cli/', '/presentation/'];
const FORBIDDEN_APPLICATION_EFFECTS = new Set(['node:child_process', 'node:fs', 'node:os']);
const findings: string[] = [];
const files = sourceFiles(SOURCE_ROOT);

for (const legacyRoot of LEGACY_ROOTS) {
  const legacyPath = path.join(SOURCE_ROOT, legacyRoot);
  if (fs.existsSync(legacyPath) && sourceFiles(legacyPath).length)
    findings.push(`src/${legacyRoot}/ is a retired compatibility root and must not be restored.`);
}

for (const file of files) {
  const relativeFile = normalize(path.relative(ROOT, file));
  const source = fs.readFileSync(file, 'utf8');

  checkVagueDirectories(relativeFile);
  checkTsNoCheck(relativeFile, source);

  if (relativeFile.startsWith('src/domain/')) {
    checkDomainDependencies(relativeFile, source);
  }
  if (relativeFile.startsWith('src/application/')) {
    checkLayerDependencies(relativeFile, source, FORBIDDEN_APPLICATION_DEPENDENCIES, 'application');
    checkProcessExitCode(relativeFile, source);
    checkApplicationEffects(relativeFile, source);
  }
  if (relativeFile.startsWith('src/infrastructure/')) {
    checkLayerDependencies(relativeFile, source, FORBIDDEN_INFRASTRUCTURE_DEPENDENCIES, 'infrastructure');
  }
}

checkApplicationCommands();

if (findings.length) {
  console.error('Architecture validation failed:\n');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log('Architecture validation passed.');
}

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) return sourceFiles(entryPath);
    if (!entry.isFile() || !/\.(?:ts|mts)$/.test(entry.name)) return [];

    return [entryPath];
  });
}

function checkVagueDirectories(relativeFile: string): void {
  const directories = relativeFile.split('/').slice(1, -1);

  for (const directory of directories) {
    if (VAGUE_DIRECTORY_NAMES.has(directory)) {
      findings.push(`${relativeFile} is inside vague directory '${directory}/'. Use an owner-specific responsibility.`);
    }
  }
}

function checkTsNoCheck(relativeFile: string, source: string): void {
  if (!source.includes('@ts-nocheck')) return;
  findings.push(`${relativeFile} uses @ts-nocheck. Source modules must remain explicitly typed.`);
}

function checkApplicationCommands(): void {
  const applicationRoot = path.join(SOURCE_ROOT, 'application');
  const commandNames = new Map<string, string>();

  for (const entry of fs.readdirSync(applicationRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const commandFile = path.join(applicationRoot, entry.name, 'command.ts');
    if (!fs.existsSync(commandFile)) continue;

    const relativeCommand = normalize(path.relative(ROOT, commandFile));
    const source = fs.readFileSync(commandFile, 'utf8');
    const registeredName = source.match(/\bname:\s*['"]([^'"]+)['"]/)?.[1];
    if (registeredName) {
      const previous = commandNames.get(registeredName);
      if (previous) findings.push(`${relativeCommand} duplicates command '${registeredName}' from ${previous}.`);
      else commandNames.set(registeredName, relativeCommand);
    }

    const commandsDirectory = path.join(applicationRoot, entry.name, 'commands');
    if (!fs.existsSync(commandsDirectory)) continue;
    const tokens = fs
      .readdirSync(commandsDirectory, { withFileTypes: true })
      .filter((command) => command.isFile() && /\.(?:ts|mts)$/.test(command.name))
      .map((command) => command.name.replace(/\.(?:ts|mts)$/, ''));

    if (tokens.length && !source.includes('subcommands:'))
      findings.push(`${relativeCommand} must expose declarative subcommand metadata.`);
    for (const token of tokens) {
      if (!source.includes(`./commands/${token}.js`))
        findings.push(`${relativeCommand} does not register public subcommand file commands/${token}.ts.`);
    }
  }
}

function checkDomainDependencies(relativeFile: string, source: string): void {
  checkLayerDependencies(relativeFile, source, FORBIDDEN_DOMAIN_DEPENDENCIES, 'domain');
}

function checkLayerDependencies(
  relativeFile: string,
  source: string,
  forbiddenDependencies: string[],
  layer: string
): void {
  for (const specifier of importSpecifiers(source)) {
    const dependency = normalizeResolvedImport(relativeFile, specifier);
    if (!dependency) continue;

    const forbidden = forbiddenDependencies.find((segment) => dependency.includes(segment));
    if (forbidden) {
      findings.push(`${relativeFile} depends on '${specifier}', crossing the ${layer} boundary through ${forbidden}.`);
    }
  }
}

function checkProcessExitCode(relativeFile: string, source: string): void {
  if (source.includes('process.exitCode'))
    findings.push(`${relativeFile} sets process.exitCode. Presentation owns process exit state.`);
}

function checkApplicationEffects(relativeFile: string, source: string): void {
  if (relativeFile.includes('/tests/')) return;
  for (const specifier of importSpecifiers(source)) {
    if (FORBIDDEN_APPLICATION_EFFECTS.has(specifier))
      findings.push(`${relativeFile} imports ${specifier}. Move the external effect behind infrastructure.`);
  }
}

function importSpecifiers(source: string): string[] {
  const imports = source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g);
  return Array.from(imports, (match) => match[2]!);
}

function normalizeResolvedImport(relativeFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;

  const importerDirectory = path.posix.dirname(`/${relativeFile}`);
  return path.posix.normalize(path.posix.join(importerDirectory, specifier));
}

function normalize(value: string): string {
  return value.split(path.sep).join('/');
}
