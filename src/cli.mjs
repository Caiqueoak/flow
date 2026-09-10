#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as inputStream, stdout as outputStream } from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PACKAGE = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = PACKAGE.version;
const PACKAGE_NAME = PACKAGE.name;
const args = process.argv.slice(2);

const RUNTIME_DEFINITIONS = {
  codex: { label: 'Codex', skillsPath: '.codex/skills' },
  claude: { label: 'Claude Code', skillsPath: '.claude/skills' }
};

function fail(message, code = 1) { console.error(`flow: ${message}`); process.exit(code); }
function info(message = '') { console.log(message); }
function hasFlag(name) { return args.includes(name); }
function valueAfter(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }
function npmCommand() { return process.platform === 'win32' ? 'npm.cmd' : 'npm'; }
function projectRoot() { return path.resolve(valueAfter('--path') || process.cwd()); }
function configPath(root) { return path.join(root, '.flow', 'config.yaml'); }
function packagePath(root) { return path.join(root, 'node_modules', '@caiqueoak', 'flow'); }

function abortedPromptError() {
  const error = new Error('Prompt aborted.');
  error.code = 'ABORT_ERR';
  return error;
}

function question(rl, message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      rl.removeListener('close', onClose);
      callback(value);
    };
    const onClose = () => finish(reject, abortedPromptError());
    rl.once('close', onClose);
    rl.question(message).then(
      (answer) => finish(resolve, answer),
      (error) => finish(reject, error)
    );
  });
}

function runNpm(npmArgs, options = {}) {
  if (process.platform === 'win32') {
    return execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', npmCommand(), ...npmArgs], options);
  }
  return execFileSync(npmCommand(), npmArgs, {
    ...options
  });
}

function copyDir(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(target, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

function quoteYaml(value) { return /^[A-Za-z0-9_.\/-]+$/.test(value) ? value : JSON.stringify(value); }
function defaultConfig() {
  return { frameworkVersion: VERSION, runtimes: [], continueAcrossWorkItems: true, workItemsConcurrency: 'auto', taskConcurrency: 'auto' };
}

function readConfig(root) {
  const file = configPath(root);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const cfg = defaultConfig();
  const v = text.match(/^[ \t]*version:[ \t]*([^\s#]+)[ \t]*$/m);
  if (v) cfg.frameworkVersion = v[1].replace(/^['"]|['"]$/g, '');
  const runtimeBlock = text.match(/^runtimes:\s*\n([\s\S]*?)(?=^[A-Za-z_][A-Za-z0-9_]*:|\Z)/m)?.[1] || '';
  const entries = runtimeBlock.split(/(?=^\s*-\s+type:)/m).filter((x) => /-\s+type:/.test(x));
  for (const entry of entries) {
    const type = entry.match(/-\s+type:\s*([^\s#]+)/)?.[1]?.replace(/^['"]|['"]$/g, '');
    const skillsPath = entry.match(/skills_path:\s*([^\n#]+)/)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
    if (type && skillsPath) cfg.runtimes.push({ type, skills_path: skillsPath });
  }
  return cfg;
}

function writeConfig(root, config) {
  const lines = ['schema_version: 1', 'framework:', '  name: flow', `  version: ${VERSION}`, 'runtimes:'];
  if (!config.runtimes.length) lines.push('  []');
  else for (const runtime of config.runtimes) {
    lines.push(`  - type: ${quoteYaml(runtime.type)}`);
    lines.push(`    skills_path: ${quoteYaml(runtime.skills_path)}`);
  }
  lines.push('autonomy:', '  continue_across_work_items: true', '  stop_on:', '    - consequential_decision', '    - external_approval', '    - unrecoverable_blocker', '    - no_ready_work', 'parallelism:', '  strategy: maximum_safe', '  max_concurrent_work_items: auto', '  max_concurrent_tasks_per_work_item: auto', 'efficiency:', '  token_usage: optimize', '  prefer_primary_orchestrator: true', '  delegate_only_when_beneficial: true', '');
  fs.mkdirSync(path.join(root, '.flow'), { recursive: true });
  fs.writeFileSync(configPath(root), lines.join('\n'), 'utf8');
}

function installRuntimeSkill(root, runtime, packageRoot = ROOT) {
  const target = path.join(root, runtime.skills_path, 'flow');
  copyDir(path.join(packageRoot, 'skills', 'flow'), target);
  return target;
}
function parseRuntimeFlag() {
  const raw = valueAfter('--runtime');
  return raw ? raw.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) : null;
}

function missingBuiltinRuntimes(existing) {
  const existingTypes = new Set(existing.map((r) => r.type));
  return Object.keys(RUNTIME_DEFINITIONS).filter((type) => !existingTypes.has(type));
}

async function promptMultiSelect(existing) {
  const existingTypes = new Set(existing.map((r) => r.type));
  const options = Object.entries(RUNTIME_DEFINITIONS).filter(([type]) => !existingTypes.has(type)).map(([value, def]) => ({ value, label: def.label }));
  options.push({ value: 'custom', label: 'Custom coding agent / skills path' });
  info(existing.length ? 'Select coding agents to add:' : 'Select coding agents:');
  options.forEach((opt, i) => info(`  [ ] ${i + 1}. ${opt.label}`));
  info('  (Select multiple with comma-separated numbers, e.g. 1,2)');
  const rl = readline.createInterface({ input: inputStream, output: outputStream });
  try {
    while (true) {
      const answer = (await question(rl, 'Selection: ')).trim();
      const indices = [...new Set(answer.split(',').map((v) => Number.parseInt(v.trim(), 10)).filter(Number.isInteger))];
      if (indices.length && indices.every((n) => n >= 1 && n <= options.length)) return indices.map((n) => options[n - 1].value);
      info('Choose one or more valid numbers.');
    }
  } finally { rl.close(); }
}

async function promptText(message, defaultValue = '') {
  const rl = readline.createInterface({ input: inputStream, output: outputStream });
  try {
    const answer = (await question(rl, `${message}${defaultValue ? ` [${defaultValue}]` : ''}: `)).trim();
    return answer || defaultValue;
  } finally { rl.close(); }
}

async function resolveRuntime(type, existing) {
  if (RUNTIME_DEFINITIONS[type]) return { type, skills_path: RUNTIME_DEFINITIONS[type].skillsPath };
  if (type !== 'custom') fail(`unsupported runtime '${type}'. Use codex, claude, or custom.`);
  const fallback = `custom-${existing.filter((r) => r.type.startsWith('custom')).length + 1}`;
  const name = await promptText('Custom coding agent id', fallback);
  while (true) {
    const skillsPath = await promptText('Project-local skills directory', `.${name}/skills`);
    if (!path.isAbsolute(skillsPath) && !skillsPath.split(/[\\/]/).includes('..')) return { type: name, skills_path: skillsPath };
    info('Skills path must be relative and remain inside the project.');
  }
}

async function initProject() {
  const root = projectRoot();
  const flowDir = path.join(root, '.flow');
  const existed = fs.existsSync(flowDir);
  const config = readConfig(root) || defaultConfig();
  if (existed) {
    info('Flow project already exists. Canonical project artifacts will not be created or modified.');
    if (config.runtimes.length) info(`Configured coding agents: ${config.runtimes.map((r) => r.type).join(', ')}`);
  }

  const requested = parseRuntimeFlag();
  if (existed && !requested && missingBuiltinRuntimes(config.runtimes).length === 0) {
    info('All built-in coding agents are already configured. Nothing to add.');
    info('Use --runtime custom only when you intentionally want to add a custom coding agent.');
    return;
  }

  const selected = requested || await promptMultiSelect(config.runtimes);
  const knownTypes = new Set(config.runtimes.map((r) => r.type));
  const added = [];
  for (const type of selected) {
    if (knownTypes.has(type)) continue;
    const runtime = await resolveRuntime(type, config.runtimes);
    if (knownTypes.has(runtime.type)) continue;
    config.runtimes.push(runtime); knownTypes.add(runtime.type); added.push(runtime);
  }
  fs.mkdirSync(flowDir, { recursive: true });
  writeConfig(root, config);
  for (const runtime of added) info(`✓ ${runtime.type}: ${path.relative(root, installRuntimeSkill(root, runtime))}`);
  if (!added.length) info('No new coding-agent integration was added.');
  else { info(); info('Flow is ready. Open a configured coding agent and invoke /flow.'); }
}

function containingNodeModules(packageRoot) {
  let current = path.resolve(packageRoot);
  while (true) {
    if (path.basename(current).toLowerCase() === 'node_modules') return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function updatePlan(root) {
  const projectPackageRoot = packagePath(root);
  if (fs.existsSync(path.join(projectPackageRoot, 'package.json'))) {
    return {
      npmArgs: ['update', PACKAGE_NAME],
      cwd: root,
      packageRoot: projectPackageRoot,
      mode: 'project'
    };
  }

  try {
    const globalNodeModules = path.resolve(runNpm(['root', '--global'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
    const globalPackageRoot = path.join(globalNodeModules, '@caiqueoak', 'flow');
    if (path.resolve(ROOT).startsWith(`${globalNodeModules}${path.sep}`) && fs.existsSync(path.join(globalPackageRoot, 'package.json'))) {
      return {
        npmArgs: ['update', '--global', PACKAGE_NAME],
        cwd: root,
        packageRoot: globalPackageRoot,
        mode: 'global'
      };
    }
  } catch { /* fall through to local installation detection */ }

  const nodeModules = containingNodeModules(ROOT);
  if (nodeModules) {
    const installRoot = path.dirname(nodeModules);
    return {
      npmArgs: ['update', PACKAGE_NAME],
      cwd: installRoot,
      packageRoot: ROOT,
      mode: 'local'
    };
  }

  fail('cannot determine how this Flow CLI was installed. Reinstall @caiqueoak/flow with npm, then run flow update again.');
}

function update() {
  const root = projectRoot();
  const config = readConfig(root);
  if (!config) fail('this project is not initialized. Run flow init first.');
  if (!config.runtimes.length) fail('no coding agents are configured. Run flow init to add one.');

  const plan = updatePlan(root);
  info(`Updating ${PACKAGE_NAME} (${plan.mode} installation)...`);
  try { runNpm(plan.npmArgs, { cwd: plan.cwd, stdio: 'inherit' }); }
  catch { fail('npm update failed. Existing project state and installed skills were not intentionally removed.'); }

  if (!fs.existsSync(path.join(plan.packageRoot, 'package.json'))) fail(`updated package not found at ${plan.packageRoot}.`);
  const latest = JSON.parse(fs.readFileSync(path.join(plan.packageRoot, 'package.json'), 'utf8'));
  for (const runtime of config.runtimes) info(`✓ ${runtime.type}: ${path.relative(root, installRuntimeSkill(root, runtime, plan.packageRoot))}`);
  const text = fs.readFileSync(configPath(root), 'utf8');
  fs.writeFileSync(configPath(root), text.replace(/(^framework:\s*\n(?:.*\n)*?\s+version:\s*)[^\n]+/m, `$1${latest.version}`), 'utf8');
  info(`Flow updated to ${latest.version}.`);
}

function help() {
  info(`Flow ${VERSION}\n\nUsage:\n  flow init [--path <project>] [--runtime codex,claude]\n  flow update [--path <project>]\n  flow --version\n\nflow init creates only .flow/config.yaml and installs the project-local /flow skill for selected coding agents.\nIf .flow already exists, init only adds coding-agent integrations and exits without prompting when all built-in integrations are already configured.\nflow update updates the installation that provides the Flow CLI (project-local or global) and refreshes every configured project-local skill.\nThere is no flow install command and no automatic/background update mechanism.`);
}

try {
  if (!args.length || hasFlag('--help') || hasFlag('-h')) help();
  else if (hasFlag('--version') || hasFlag('-v')) info(VERSION);
  else if (args[0] === 'init') await initProject();
  else if (args[0] === 'update') update();
  else fail(`unknown command '${args[0]}'. Run flow --help.`);
} catch (error) {
  if (error?.code === 'ABORT_ERR') {
    info('\nFlow command canceled.');
    process.exitCode = 130;
  } else {
    throw error;
  }
}
