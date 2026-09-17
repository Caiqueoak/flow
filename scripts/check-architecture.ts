import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, 'src');

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
const TS_NOCHECK_DEBT = new Set([
  'src/application/init/operations/init.mts',
  'src/application/migrate/operations/apply.mts',
  'src/application/route/operations/route.mts',
  'src/application/schemas/operations/schemas.mts',
  'src/application/status/operations/status.mts',
  'src/application/sync/operations/sync.mts',
  'src/application/trace/operations/trace.mts',
  'src/application/validate/operations/validate.mts'
]);

const findings: string[] = [];

for (const file of sourceFiles(SOURCE_ROOT)) {
  const relativeFile = normalize(path.relative(ROOT, file));
  const source = fs.readFileSync(file, 'utf8');

  checkVagueDirectories(relativeFile);
  checkTsNoCheck(relativeFile, source);

  if (relativeFile.startsWith('src/domain/')) {
    checkDomainDependencies(relativeFile, source);
  }
}

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
      findings.push(
        `${relativeFile} is inside vague directory '${directory}/'. Use an owner-specific responsibility.`
      );
    }
  }
}

function checkTsNoCheck(relativeFile: string, source: string): void {
  if (!relativeFile.startsWith('src/application/') && !relativeFile.startsWith('src/domain/')) return;
  if (!source.includes('@ts-nocheck')) return;
  if (TS_NOCHECK_DEBT.has(relativeFile)) return;

  findings.push(`${relativeFile} uses @ts-nocheck. Application and domain code must remain explicitly typed.`);
}

function checkDomainDependencies(relativeFile: string, source: string): void {
  for (const specifier of importSpecifiers(source)) {
    const dependency = normalizeResolvedImport(relativeFile, specifier);
    if (!dependency) continue;

    const forbidden = FORBIDDEN_DOMAIN_DEPENDENCIES.find((segment) => dependency.includes(segment));
    if (forbidden) {
      findings.push(`${relativeFile} depends on '${specifier}', crossing the domain boundary through ${forbidden}.`);
    }
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
