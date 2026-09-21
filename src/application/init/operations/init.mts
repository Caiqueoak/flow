import path from 'node:path';
import {
  fail,
  optionValue as valueAfter,
  promptMultiSelect,
  promptSelect,
  promptText,
  recordOutput as info,
  type PromptOption
} from '../../command-runtime.js';
import {
  defaultConfig,
  readConfig,
  writeConfig,
  type FlowConfiguration,
  type RuntimeConfiguration
} from '../../../infrastructure/persistence/configuration.mjs';
import { projectRoot } from '../../command-runtime.js';
import { installRuntimeSkill } from '../../../infrastructure/runtime/runtime-skills.js';
import { BROWNFIELD_POLICIES, ENGINEERING_PROFILES } from '../../../infrastructure/runtime/engineering-profiles.js';
import { FLOW_SCHEMA_VERSION } from '../../../domain/project/project.js';
import { GATES_SCHEMA_VERSION } from '../../../domain/gate/gate.js';
import {
  directoryEntryNames,
  ensureDirectory,
  fileExists,
  writeText
} from '../../../infrastructure/filesystem/index.js';

const RUNTIME_DEFINITIONS = {
  codex: { label: 'Codex', skillsPath: '.codex/skills' },
  claude: { label: 'Claude Code', skillsPath: '.claude/skills' }
} as const;

type KnownRuntime = keyof typeof RUNTIME_DEFINITIONS;

function parseRuntimeFlag(args: readonly string[]): string[] | null {
  const raw = valueAfter(args, '--runtime');
  return raw
    ? raw
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
    : null;
}
function missingBuiltinRuntimes(existing: readonly RuntimeConfiguration[]): KnownRuntime[] {
  const types = new Set(existing.map((runtime) => runtime.type));
  return (Object.keys(RUNTIME_DEFINITIONS) as KnownRuntime[]).filter((type) => !types.has(type));
}
async function selectRuntimes(existing: readonly RuntimeConfiguration[]): Promise<string[]> {
  const types = new Set(existing.map((runtime) => runtime.type));
  const options: PromptOption[] = Object.entries(RUNTIME_DEFINITIONS)
    .filter(([type]) => !types.has(type))
    .map(([value, d]) => ({ value, label: d.label }));
  options.push({ value: 'custom', label: 'Custom coding agent / skills path' });
  return promptMultiSelect({
    title: existing.length ? 'Select coding agents to add:' : 'Select coding agents:',
    options
  });
}
async function resolveRuntime(type: string, existing: readonly RuntimeConfiguration[]): Promise<RuntimeConfiguration> {
  if (isKnownRuntime(type)) return { type, skills_path: RUNTIME_DEFINITIONS[type].skillsPath };
  if (type !== 'custom') fail(`unsupported runtime '${type}'. Use codex, claude, or custom.`);
  const fallback = `custom-${existing.filter((runtime) => runtime.type.startsWith('custom')).length + 1}`;
  const name = await promptText('Custom coding agent id', fallback);
  while (true) {
    const skillsPath = await promptText('Project-local skills directory', `.${name}/skills`);
    if (!path.isAbsolute(skillsPath) && !skillsPath.split(/[\\/]/).includes('..'))
      return { type: name, skills_path: skillsPath };
    info('Skills path must be relative and remain inside the project.');
  }
}
async function selectEngineering(
  args: readonly string[],
  root: string,
  config: FlowConfiguration,
  existed: boolean
): Promise<void> {
  const profileFlag = valueAfter(args, '--profile');
  const brownfieldFlag = valueAfter(args, '--existing-code');
  if (args.includes('--brownfield'))
    fail('Use --existing-code preserve|incremental|refactor to choose the brownfield adoption strategy.');
  if (existed && (profileFlag || brownfieldFlag))
    fail('Change engineering through /flow and human approval, not init.');
  if (profileFlag && !ENGINEERING_PROFILES[profileFlag]) fail(`unknown engineering profile '${profileFlag}'.`);
  if (brownfieldFlag && !BROWNFIELD_POLICIES[brownfieldFlag]) fail(`unknown brownfield policy '${brownfieldFlag}'.`);
  if (profileFlag) config.engineering.profile = ENGINEERING_PROFILES[profileFlag]!.id;
  const hasProjectFiles = directoryEntryNames(root).some(
    (name) => ['src', 'app', 'lib', 'packages'].includes(name) || /\.(m?[jt]sx?|py|java|go|rs|cs)$/.test(name)
  );
  if (brownfieldFlag)
    config.engineering.existing_code_policy = brownfieldFlag === 'improve' ? 'incremental' : brownfieldFlag;
  else if (!existed && hasProjectFiles)
    config.engineering.existing_code_policy = await promptSelect({
      title: 'How should Flow adopt this existing repository?',
      options: Object.entries(BROWNFIELD_POLICIES).flatMap(([value, policy]) =>
        value !== 'improve' && policy
          ? [
              {
                value,
                label: policy.label,
                description: policy.description
              }
            ]
          : []
      )
    });
}

export async function runInit({
  args,
  packageRoot,
  version
}: {
  args: string[];
  packageRoot: string;
  version: string;
}): Promise<void> {
  const root = projectRoot(args);
  const flowDirectory = path.join(root, '_flow');
  if (!fileExists(flowDirectory) && fileExists(path.join(root, '.flow')))
    fail(
      'Legacy .flow project requires flow migrate --plan and flow migrate --apply before init. No files were changed.'
    );
  const existed = fileExists(flowDirectory);
  const config = readConfig(root) || defaultConfig(version);
  if (config.schema_version !== FLOW_SCHEMA_VERSION)
    fail('Existing Flow project requires npx --no-install flow migrate before init. No files were changed.');
  if (existed) info('Flow project already exists. Canonical project artifacts will not be created or modified.');
  await selectEngineering(args, root, config, existed);
  const requested = parseRuntimeFlag(args);
  if (existed && !requested && missingBuiltinRuntimes(config.runtimes).length === 0) {
    writeConfig(root, config);
    for (const runtime of config.runtimes) installRuntimeSkill(root, runtime, packageRoot);
    info('All built-in coding agents are already configured. Configuration is up to date.');
    return;
  }
  const selected = requested || (await selectRuntimes(config.runtimes));
  const known = new Set(config.runtimes.map((r) => r.type));
  const added = [];
  for (const type of selected) {
    if (known.has(type)) continue;
    const runtime = await resolveRuntime(type, config.runtimes);
    if (known.has(runtime.type)) continue;
    config.runtimes.push(runtime);
    known.add(runtime.type);
    added.push(runtime);
  }
  ensureDirectory(flowDirectory);
  config.flow_version = version;
  writeConfig(root, config);
  if (!existed) {
    writeText(path.join(flowDirectory, 'gates.yaml'), `schema_version: ${GATES_SCHEMA_VERSION}\ngates: []\n`);
    ensureDirectory(path.join(flowDirectory, 'work-items'));
    ensureDirectory(path.join(flowDirectory, 'generated'));
    writeText(path.join(flowDirectory, 'generated', '.gitignore'), '*\n!.gitignore\n');
  }
  for (const runtime of config.runtimes)
    info(`Ã¢Å“â€œ ${runtime.type}: ${path.relative(root, installRuntimeSkill(root, runtime, packageRoot))}`);
  info(`Engineering profile: ${ENGINEERING_PROFILES[config.engineering.profile]?.label ?? config.engineering.profile}`);
  info(
    'Flow is ready. Invoke /flow; engineering bootstrap runs before implementation when no approved contract exists.'
  );
}

function isKnownRuntime(value: string): value is KnownRuntime {
  return value in RUNTIME_DEFINITIONS;
}
