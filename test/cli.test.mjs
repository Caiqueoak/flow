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

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'flow-cli-'));
}

async function run(args, cwd) {
  try {
    return await execFileAsync(process.execPath, [cli, ...args], { cwd });
  } catch (error) {
    return { code: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

test('reports the package version', async () => {
  const result = await run(['--version'], root);
  assert.equal(result.stdout.trim(), packageJson.version);
});

test('initializes the Flow project state without replacing existing templates', async () => {
  const project = await tempDir();
  const first = await run(['init', '--path', project], root);
  assert.match(first.stdout, /Initialized Flow project/);
  assert.equal(await fs.readFile(path.join(project, '.flow', 'PRD.md'), 'utf8'), await fs.readFile(path.join(root, 'templates', 'PRD.md'), 'utf8'));

  const second = await run(['init', '--path', project, '--force'], root);
  assert.match(second.stdout, /Initialized Flow project/);
  assert.equal(await fs.stat(path.join(project, '.flow', 'work-items')).then(() => true), true);
});

test('installs skills without overwriting them unless forced', async () => {
  const project = await tempDir();
  const target = path.join(project, 'skills');
  const existing = path.join(target, 'flow-new', 'SKILL.md');
  await fs.mkdir(path.dirname(existing), { recursive: true });
  await fs.writeFile(existing, 'custom skill');

  const first = await run(['install', '--target', target], project);
  assert.match(first.stdout, /Existing skill files were preserved/);
  assert.equal(await fs.readFile(existing, 'utf8'), 'custom skill');

  await run(['install', '--target', target, '--force'], project);
  assert.match(await fs.readFile(existing, 'utf8'), /# Flow New/);
});

test('requires an explicit target when several conventional skill directories exist', async () => {
  const project = await tempDir();
  await Promise.all([
    fs.mkdir(path.join(project, '.agents', 'skills'), { recursive: true }),
    fs.mkdir(path.join(project, '.claude', 'skills'), { recursive: true })
  ]);

  const result = await run(['install'], project);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /multiple skill directories detected/);
});
