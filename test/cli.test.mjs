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
async function run(args, cwd = root) {
  try { return await execFileAsync(process.execPath, [cli, ...args], { cwd }); }
  catch (error) { return { code: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }; }
}

test('reports the package version', async () => {
  const result = await run(['--version']);
  assert.equal(result.stdout.trim(), packageJson.version);
});

test('initializes Codex with only Flow configuration and the public skill', async () => {
  const project = await tempDir();
  const result = await run(['init', '--path', project, '--runtime', 'codex']);
  assert.match(result.stdout, /Flow is ready/);
  const config = await fs.readFile(path.join(project, '.flow', 'config.yaml'), 'utf8');
  assert.match(config, /type: codex/);
  assert.match(config, /skills_path: .codex\/skills/);
  assert.match(await fs.readFile(path.join(project, '.codex', 'skills', 'flow', 'SKILL.md'), 'utf8'), /# Flow/);
  await assert.rejects(fs.stat(path.join(project, '.flow', 'PRD.md')));
});

test('adds a second configured runtime without replacing canonical artifacts', async () => {
  const project = await tempDir();
  await run(['init', '--path', project, '--runtime', 'codex']);
  await fs.writeFile(path.join(project, '.flow', 'PRD.md'), 'existing project truth');
  const result = await run(['init', '--path', project, '--runtime', 'claude']);
  assert.match(result.stdout, /already exists/);
  const config = await fs.readFile(path.join(project, '.flow', 'config.yaml'), 'utf8');
  assert.match(config, /type: codex/);
  assert.match(config, /type: claude/);
  assert.equal(await fs.readFile(path.join(project, '.flow', 'PRD.md'), 'utf8'), 'existing project truth');
  assert.match(await fs.readFile(path.join(project, '.claude', 'skills', 'flow', 'SKILL.md'), 'utf8'), /# Flow/);
});

test('rejects unsupported runtimes passed by flag', async () => {
  const project = await tempDir();
  const result = await run(['init', '--path', project, '--runtime', 'unknown']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /unsupported runtime/);
});
