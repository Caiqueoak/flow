import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
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
async function run(args, cwd = root, options = {}) {
  try {
    return await execFileAsync(process.execPath, [cli, ...args], {
      cwd,
      ...options,
      env: { ...process.env, ...(options.env || {}) }
    });
  } catch (error) {
    return { code: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

async function runWithClosedInput(args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end('\n');
  });
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

test('existing project with all built-in runtimes exits without prompting', async () => {
  const project = await tempDir();
  await run(['init', '--path', project, '--runtime', 'codex,claude']);
  const result = await run(['init', '--path', project]);
  assert.match(result.stdout, /already exists/);
  assert.match(result.stdout, /All built-in coding agents are already configured/);
  assert.doesNotMatch(result.stdout, /Selection:/);
});

test('updates a project-local Flow installation and refreshes configured skills', async () => {
  const project = await tempDir();
  await run(['init', '--path', project, '--runtime', 'codex']);

  const installed = path.join(project, 'node_modules', '@caiqueoak', 'flow');
  await fs.mkdir(path.join(installed, 'skills', 'flow'), { recursive: true });
  await fs.writeFile(path.join(installed, 'package.json'), JSON.stringify({ name: '@caiqueoak/flow', version: '9.9.9' }));
  await fs.writeFile(path.join(installed, 'skills', 'flow', 'SKILL.md'), '# Flow\n\nupdated skill');

  const bin = path.join(project, 'fake-bin');
  await fs.mkdir(bin, { recursive: true });
  if (process.platform === 'win32') {
    await fs.writeFile(path.join(bin, 'npm.cmd'), '@echo off\r\nexit /b 0\r\n');
  } else {
    const npm = path.join(bin, 'npm');
    await fs.writeFile(npm, '#!/bin/sh\nexit 0\n');
    await fs.chmod(npm, 0o755);
  }

  const result = await run(['update', '--path', project], project, { env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` } });
  assert.match(result.stdout, /project installation/);
  assert.match(result.stdout, /Flow updated to 9.9.9/);
  assert.match(await fs.readFile(path.join(project, '.codex', 'skills', 'flow', 'SKILL.md'), 'utf8'), /updated skill/);
  assert.match(await fs.readFile(path.join(project, '.flow', 'config.yaml'), 'utf8'), /version: 9.9.9/);
});

test('rejects unsupported runtimes passed by flag', async () => {
  const project = await tempDir();
  const result = await run(['init', '--path', project, '--runtime', 'unknown']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /unsupported runtime/);
});

test('cancels an interactive init cleanly when input closes', async () => {
  const project = await tempDir();
  const result = await runWithClosedInput(['init', '--path', project]);
  assert.equal(result.code, 130);
  assert.match(result.stdout, /Flow command canceled/);
  assert.doesNotMatch(result.stderr, /AbortError|unsettled top-level await/);
  await assert.rejects(fs.stat(path.join(project, '.flow')));
});
