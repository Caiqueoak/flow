import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'src', 'cli.mjs');
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
async function tempDir() { return fs.mkdtemp(path.join(os.tmpdir(), 'flow-cli-')); }
async function run(args, cwd = root) { try { return await execFileAsync(process.execPath, [cli, ...args], { cwd }); } catch (error) { return { code: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }; } }

test('reports package version and exposes deterministic workflow commands', async () => {
  assert.equal((await run(['--version'])).stdout.trim(), packageJson.version);
  const help = await run(['--help']);
  for (const command of ['flow validate', 'flow route', 'flow status', 'flow graph', 'flow trace', 'flow migrate']) assert.match(help.stdout, new RegExp(command));
});

test('noninteractive init records profile/policy without duplicating framework version', async () => {
  const project = await tempDir();
  const result = await run(['init', '--path', project, '--runtime', 'codex', '--profile', 'pragmatic', '--brownfield', 'rebaseline']);
  assert.match(result.stdout, /Engineering profile/);
  const config = await fs.readFile(path.join(project, '.flow', 'config.yaml'), 'utf8');
  assert.match(config, /profile: pragmatic/);
  assert.match(config, /brownfield_policy: rebaseline/);
  assert.doesNotMatch(config, /framework:/);
  assert.match(await fs.readFile(path.join(project, '.codex', 'skills', 'flow', 'SKILL.md'), 'utf8'), /Execution loop/);
  await assert.rejects(fs.stat(path.join(project, '.flow', 'backlog.yaml')));
});

test('init preserves existing canonical project artifacts while adding runtime', async () => {
  const project = await tempDir();
  await run(['init', '--path', project, '--runtime', 'codex', '--profile', 'pragmatic']);
  await fs.writeFile(path.join(project, '.flow', 'backlog.yaml'), 'sentinel');
  await run(['init', '--path', project, '--runtime', 'claude']);
  assert.equal(await fs.readFile(path.join(project, '.flow', 'backlog.yaml'), 'utf8'), 'sentinel');
  assert.match(await fs.readFile(path.join(project, '.claude', 'skills', 'flow', 'invariants.md'), 'utf8'), /No status-only stop/);
});

test('rejects unknown profile and runtime', async () => {
  const project = await tempDir();
  assert.match((await run(['init', '--path', project, '--runtime', 'codex', '--profile', 'magic'])).stderr, /unknown engineering profile/);
  assert.match((await run(['init', '--path', project, '--runtime', 'unknown', '--profile', 'pragmatic'])).stderr, /unsupported runtime/);
});
