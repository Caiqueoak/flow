import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(packageRoot, 'src', 'cli.mjs');

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'flow-update-'));
}

async function run(args, cwd, env = {}) {
  try {
    return await execFileAsync(process.execPath, [cli, ...args], { cwd, env: { ...process.env, ...env } });
  } catch (error) {
    return { code: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

async function fakeNpm(project, installed, version = '9.9.9') {
  const bin = path.join(project, 'fake-bin');
  const invocation = path.join(project, 'npm-invocation.txt');
  await fs.mkdir(bin, { recursive: true });
  const script = process.platform === 'win32'
    ? `@echo off\r\necho %*>> "%FLOW_TEST_NPM_INVOCATION%"\r\nif "%1"=="install" (\r\n  if not exist "%FLOW_TEST_PACKAGE_ROOT%\\skills\\flow" mkdir "%FLOW_TEST_PACKAGE_ROOT%\\skills\\flow"\r\n  > "%FLOW_TEST_PACKAGE_ROOT%\\package.json" echo {"name":"@caiqueoak/flow","version":"${version}"}\r\n  > "%FLOW_TEST_PACKAGE_ROOT%\\skills\\flow\\SKILL.md" echo # Flow updated skill\r\n)\r\nexit /b 0\r\n`
    : `#!/bin/sh\nprintf "%s\\n" "$*" >> "$FLOW_TEST_NPM_INVOCATION"\nif [ "$1" = install ]; then\n  mkdir -p "$FLOW_TEST_PACKAGE_ROOT/skills/flow"\n  printf '%s' '{"name":"@caiqueoak/flow","version":"${version}"}' > "$FLOW_TEST_PACKAGE_ROOT/package.json"\n  printf '%s' '# Flow updated skill' > "$FLOW_TEST_PACKAGE_ROOT/skills/flow/SKILL.md"\nfi\nexit 0\n`;
  const npm = path.join(bin, process.platform === 'win32' ? 'npm.cmd' : 'npm');
  await fs.writeFile(npm, script);
  if (process.platform !== 'win32') await fs.chmod(npm, 0o755);
  return {
    invocation,
    env: {
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      FLOW_TEST_NPM_INVOCATION: invocation,
      FLOW_TEST_PACKAGE_ROOT: installed
    }
  };
}

async function initializedProject() {
  const project = await tempDir();
  const init = await run(['init', '--path', project, '--runtime', 'codex', '--profile', 'pragmatic', '--brownfield', 'rebaseline'], project);
  assert.equal(init.code, undefined);
  return project;
}

test('updates a project installation, refreshes skills, and keeps package version out of config', async () => {
  const project = await initializedProject();
  const installed = path.join(project, 'node_modules', '@caiqueoak', 'flow');
  await fs.mkdir(path.join(installed, 'skills', 'flow'), { recursive: true });
  await fs.writeFile(path.join(installed, 'package.json'), JSON.stringify({ name: '@caiqueoak/flow', version: '9.9.9' }));
  await fs.writeFile(path.join(installed, 'skills', 'flow', 'SKILL.md'), '# Flow\n\nupdated skill');
  const npm = await fakeNpm(project, installed);

  const result = await run(['update', '--path', project], project, npm.env);
  assert.match(result.stdout, /project installation/);
  assert.match(result.stdout, /Flow updated to 9.9.9/);
  assert.match(await fs.readFile(npm.invocation, 'utf8'), /update @caiqueoak\/flow/);
  assert.match(await fs.readFile(path.join(project, '.codex', 'skills', 'flow', 'SKILL.md'), 'utf8'), /updated skill/);
  assert.doesNotMatch(await fs.readFile(path.join(project, '.flow', 'config.yaml'), 'utf8'), /^framework:|^\s+version:/m);
});

test('repairs a project package that diverges from package-lock before updating', async () => {
  const project = await initializedProject();
  const installed = path.join(project, 'node_modules', '@caiqueoak', 'flow');
  await fs.mkdir(path.join(installed, 'skills', 'flow'), { recursive: true });
  await fs.writeFile(path.join(installed, 'package.json'), JSON.stringify({ name: '@caiqueoak/flow', version: '9.9.8' }));
  await fs.writeFile(path.join(installed, 'skills', 'flow', 'SKILL.md'), '# Flow stale skill');
  await fs.writeFile(path.join(project, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/@caiqueoak/flow': { version: '9.9.9' } } }));
  const npm = await fakeNpm(project, installed);

  const result = await run(['update', '--path', project], project, npm.env);
  assert.match(result.stdout, /Repairing divergent/);
  assert.match(await fs.readFile(npm.invocation, 'utf8'), /install[\r\n]+update @caiqueoak\/flow/);
  assert.equal(JSON.parse(await fs.readFile(path.join(installed, 'package.json'), 'utf8')).version, '9.9.9');
  assert.equal((await fs.readdir(project)).some((entry) => entry.startsWith('.flow-update-backup-')), false);
});
