#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PACKAGE = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = PACKAGE.version;
const PACKAGE_NAME = PACKAGE.name;
const args = process.argv.slice(2);

function fail(message, code = 1) {
  console.error(`flow: ${message}`);
  process.exit(code);
}

function info(message) { console.log(message); }
function hasFlag(name) { return args.includes(name); }
function valueAfter(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }
function npmCommand() { return process.platform === 'win32' ? 'npm.cmd' : 'npm'; }

function copyDir(source, target, { overwrite = false } = {}) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(target, entry.name);
    if (entry.isDirectory()) copyDir(src, dst, { overwrite });
    else if (!fs.existsSync(dst) || overwrite) fs.copyFileSync(src, dst);
  }
}

function conventionalSkillTargets(cwd) {
  const candidates = [
    path.join(cwd, '.agents', 'skills'),
    path.join(cwd, '.claude', 'skills'),
    path.join(os.homedir(), '.agents', 'skills'),
    path.join(os.homedir(), '.claude', 'skills')
  ];
  return [...new Set(candidates)].filter((candidate) => fs.existsSync(candidate));
}

function resolveInstallTarget() {
  const explicit = valueAfter('--target');
  if (explicit) return path.resolve(explicit.replace(/^~(?=$|\/|\\)/, os.homedir()));
  const detected = conventionalSkillTargets(process.cwd());
  if (detected.length === 1) return detected[0];
  if (detected.length > 1) fail(`multiple skill directories detected:\n${detected.map((x) => `  - ${x}`).join('\n')}\nUse --target <skills-directory>.`);
  fail('no skill directory detected. Use --target <skills-directory>. This keeps Flow runtime-agnostic.');
}

function initProject() {
  const projectRoot = path.resolve(valueAfter('--path') || process.cwd());
  const flowDir = path.join(projectRoot, '.flow');
  if (fs.existsSync(flowDir) && !hasFlag('--force')) fail(`${flowDir} already exists. Use --force only to add missing templates without replacing project state.`);
  fs.mkdirSync(flowDir, { recursive: true });
  copyDir(path.join(ROOT, 'templates'), flowDir, { overwrite: false });
  fs.mkdirSync(path.join(flowDir, 'work-items'), { recursive: true });
  fs.mkdirSync(path.join(flowDir, 'gates'), { recursive: true });
  info(`Initialized Flow project at ${flowDir}`);
  info('Next: open your coding agent and run /flow-new with the idea or existing source documents.');
}

function installSkills({ force = hasFlag('--force') } = {}) {
  const target = resolveInstallTarget();
  fs.mkdirSync(target, { recursive: true });
  copyDir(path.join(ROOT, 'skills'), target, { overwrite: force });
  info(`Installed Flow ${VERSION} skills to ${target}`);
  if (!force) info('Existing skill files were preserved. Use --force to replace them.');
  return target;
}

function latestPublishedVersion() {
  try {
    return execFileSync(npmCommand(), ['view', PACKAGE_NAME, 'version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim();
  } catch {
    return null;
  }
}

function compareVersions(a, b) {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function update() {
  const target = resolveInstallTarget();
  const latest = latestPublishedVersion();
  if (!latest) fail(`could not read the latest ${PACKAGE_NAME} version from npm.`);
  if (compareVersions(latest, VERSION) <= 0) {
    copyDir(path.join(ROOT, 'skills'), target, { overwrite: true });
    info(`Flow ${VERSION} is already current. Skills refreshed at ${target}`);
    return;
  }

  info(`Updating Flow skills ${VERSION} → ${latest}...`);
  const execArgs = ['exec', '--yes', `--package=${PACKAGE_NAME}@${latest}`, '--', 'flow', 'install', '--target', target, '--force'];
  try {
    execFileSync(npmCommand(), execArgs, { stdio: 'inherit' });
  } catch {
    fail('update failed. Your existing installation was not intentionally removed.');
  }
  info(`Skills updated to Flow ${latest}.`);
  info(`If Flow itself is globally installed, update the CLI with: npm install -g ${PACKAGE_NAME}@latest`);
}

function help() {
  info(`Flow ${VERSION}\n\nUsage:\n  flow init [--path <project>] [--force]\n  flow install [--target <skills-directory>] [--force]\n  flow update [--target <skills-directory>]\n  flow --version\n\nThe CLI only initializes project state and installs/updates skills.\nWorkflow orchestration is performed by the coding agent through the Flow skills.`);
}

if (args.length === 0 || hasFlag('--help') || hasFlag('-h')) help();
else if (hasFlag('--version') || hasFlag('-v')) info(VERSION);
else {
  switch (args[0]) {
    case 'init': initProject(); break;
    case 'install': installSkills(); break;
    case 'update': update(); break;
    default: fail(`unknown command '${args[0]}'. Run flow --help.`);
  }
}
