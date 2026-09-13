import fs from 'node:fs';
import path from 'node:path';
import { fail, info, promptMultiSelect, promptSelect, promptText } from '../shared/cli-io.mjs';
import { defaultConfig, readConfig, writeConfig } from '../shared/project-config.mjs';
import { projectRoot, valueAfter } from '../shared/project-path.mjs';
import { installRuntimeSkill } from '../shared/skill-installer.mjs';
import { BROWNFIELD_POLICIES, ENGINEERING_PROFILES } from '../shared/profiles.mjs';

const RUNTIME_DEFINITIONS = {
  codex: { label: 'Codex', skillsPath: '.codex/skills' },
  claude: { label: 'Claude Code', skillsPath: '.claude/skills' }
};
function parseRuntimeFlag(args) {
  const raw = valueAfter(args, '--runtime');
  return raw
    ? raw
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
    : null;
}
function missingBuiltinRuntimes(existing) {
  const types = new Set(existing.map((r) => r.type));
  return Object.keys(RUNTIME_DEFINITIONS).filter((type) => !types.has(type));
}
async function selectRuntimes(existing) {
  const types = new Set(existing.map((r) => r.type));
  const options = Object.entries(RUNTIME_DEFINITIONS)
    .filter(([type]) => !types.has(type))
    .map(([value, d]) => ({ value, label: d.label }));
  options.push({ value: 'custom', label: 'Custom coding agent / skills path' });
  return promptMultiSelect({
    title: existing.length ? 'Select coding agents to add:' : 'Select coding agents:',
    options
  });
}
async function resolveRuntime(type, existing) {
  if (RUNTIME_DEFINITIONS[type]) return { type, skills_path: RUNTIME_DEFINITIONS[type].skillsPath };
  if (type !== 'custom') fail(`unsupported runtime '${type}'. Use codex, claude, or custom.`);
  const fallback = `custom-${existing.filter((r) => r.type.startsWith('custom')).length + 1}`;
  const name = await promptText('Custom coding agent id', fallback);
  while (true) {
    const skillsPath = await promptText('Project-local skills directory', `.${name}/skills`);
    if (!path.isAbsolute(skillsPath) && !skillsPath.split(/[\\/]/).includes('..'))
      return { type: name, skills_path: skillsPath };
    info('Skills path must be relative and remain inside the project.');
  }
}
async function selectEngineering(args, root, config, existed) {
  const profileFlag = valueAfter(args, '--profile');
  const brownfieldFlag = valueAfter(args, '--existing-code');
  if (args.includes('--brownfield'))
    fail(
      'Use --existing-code improve|preserve: improve recommends clearer structure; preserve keeps consistent conventions.'
    );
  if (existed && (profileFlag || brownfieldFlag))
    fail('Change engineering through /flow and human approval, not init.');
  if (profileFlag && !ENGINEERING_PROFILES[profileFlag]) fail(`unknown engineering profile '${profileFlag}'.`);
  if (brownfieldFlag && !BROWNFIELD_POLICIES[brownfieldFlag]) fail(`unknown brownfield policy '${brownfieldFlag}'.`);
  if (profileFlag) config.engineering.profile = ENGINEERING_PROFILES[profileFlag].id;
  const hasProjectFiles = fs
    .readdirSync(root)
    .some((name) => ['src', 'app', 'lib', 'packages'].includes(name) || /\.(m?[jt]sx?|py|java|go|rs|cs)$/.test(name));
  if (brownfieldFlag) config.engineering.existing_code_policy = brownfieldFlag;
  else if (!existed && hasProjectFiles)
    config.engineering.existing_code_policy = await promptSelect({
      title: 'How should Flow treat existing code conventions?',
      options: Object.entries(BROWNFIELD_POLICIES).map(([value, policy]) => ({
        value,
        label: policy.label,
        description: policy.description
      }))
    });
}

export async function runInit({ args, packageRoot }) {
  const root = projectRoot(args);
  const flowDirectory = path.join(root, '.flow');
  const existed = fs.existsSync(flowDirectory);
  const config = readConfig(root) || defaultConfig();
  if (config.schema_version !== 2)
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
  fs.mkdirSync(flowDirectory, { recursive: true });
  writeConfig(root, config);
  for (const runtime of config.runtimes)
    info(`✓ ${runtime.type}: ${path.relative(root, installRuntimeSkill(root, runtime, packageRoot))}`);
  info(`Engineering profile: ${ENGINEERING_PROFILES[config.engineering.profile]?.label ?? config.engineering.profile}`);
  info(
    'Flow is ready. Invoke /flow; engineering bootstrap runs before implementation when no approved contract exists.'
  );
}
