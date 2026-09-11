import fs from 'node:fs';
import path from 'node:path';
import { fail, info, promptMultiSelect, promptText } from '../shared/cli-io.mjs';
import { defaultConfig, readConfig, writeConfig } from '../shared/project-config.mjs';
import { projectRoot, valueAfter } from '../shared/project-path.mjs';
import { installRuntimeSkill } from '../shared/skill-installer.mjs';

const RUNTIME_DEFINITIONS = {
  codex: { label: 'Codex', skillsPath: '.codex/skills' },
  claude: { label: 'Claude Code', skillsPath: '.claude/skills' }
};

function parseRuntimeFlag(args) {
  const raw = valueAfter(args, '--runtime');
  return raw
    ? raw
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    : null;
}

function missingBuiltinRuntimes(existing) {
  const existingTypes = new Set(existing.map((runtime) => runtime.type));
  return Object.keys(RUNTIME_DEFINITIONS).filter((type) => !existingTypes.has(type));
}

async function selectRuntimes(existing) {
  const existingTypes = new Set(existing.map((runtime) => runtime.type));
  const options = Object.entries(RUNTIME_DEFINITIONS)
    .filter(([type]) => !existingTypes.has(type))
    .map(([value, definition]) => ({ value, label: definition.label }));
  options.push({ value: 'custom', label: 'Custom coding agent / skills path' });
  return promptMultiSelect({
    title: existing.length ? 'Select coding agents to add:' : 'Select coding agents:',
    options
  });
}

async function resolveRuntime(type, existing) {
  if (RUNTIME_DEFINITIONS[type]) return { type, skills_path: RUNTIME_DEFINITIONS[type].skillsPath };
  if (type !== 'custom') fail(`unsupported runtime '${type}'. Use codex, claude, or custom.`);

  const fallback = `custom-${existing.filter((runtime) => runtime.type.startsWith('custom')).length + 1}`;
  const name = await promptText('Custom coding agent id', fallback);
  while (true) {
    const skillsPath = await promptText('Project-local skills directory', `.${name}/skills`);
    if (!path.isAbsolute(skillsPath) && !skillsPath.split(/[\\/]/).includes('..')) {
      return { type: name, skills_path: skillsPath };
    }
    info('Skills path must be relative and remain inside the project.');
  }
}

export async function runInit({ args, packageRoot, version }) {
  const root = projectRoot(args);
  const flowDirectory = path.join(root, '.flow');
  const existed = fs.existsSync(flowDirectory);
  const config = readConfig(root, version) || defaultConfig(version);
  if (existed) {
    info('Flow project already exists. Canonical project artifacts will not be created or modified.');
    if (config.runtimes.length)
      info(`Configured coding agents: ${config.runtimes.map((runtime) => runtime.type).join(', ')}`);
  }

  const requested = parseRuntimeFlag(args);
  if (existed && !requested && missingBuiltinRuntimes(config.runtimes).length === 0) {
    info('All built-in coding agents are already configured. Nothing to add.');
    info('Use --runtime custom only when you intentionally want to add a custom coding agent.');
    return;
  }

  const selected = requested || (await selectRuntimes(config.runtimes));
  const knownTypes = new Set(config.runtimes.map((runtime) => runtime.type));
  const added = [];
  for (const type of selected) {
    if (knownTypes.has(type)) continue;
    const runtime = await resolveRuntime(type, config.runtimes);
    if (knownTypes.has(runtime.type)) continue;
    config.runtimes.push(runtime);
    knownTypes.add(runtime.type);
    added.push(runtime);
  }

  fs.mkdirSync(flowDirectory, { recursive: true });
  writeConfig(root, config, version);
  for (const runtime of added) {
    info(`✓ ${runtime.type}: ${path.relative(root, installRuntimeSkill(root, runtime, packageRoot))}`);
  }
  if (!added.length) info('No new coding-agent integration was added.');
  else {
    info();
    info('Flow is ready. Open a configured coding agent and invoke /flow.');
  }
}
