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

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'flow-cli-'));
}
async function run(args, cwd = root, options = {}) {
  const { cliPath = cli, ...execOptions } = options;
  try {
    return await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd,
      ...execOptions,
      env: { ...process.env, ...(execOptions.env || {}) }
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
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
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

test('routes help and unknown commands through the entrypoint', async () => {
  const help = await run(['--help']);
  assert.match(help.stdout, /flow graph/);

  const unknown = await run(['unknown']);
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /unknown command 'unknown'/);
});

test('installs the mandatory graph projection contract with the public skill', async () => {
  const project = await tempDir();
  await run(['init', '--path', project, '--runtime', 'codex']);
  const rules = await fs.readFile(path.join(project, '.codex', 'skills', 'flow', 'references', 'graph.md'), 'utf8');
  assert.match(rules, /Each Mermaid card contains exactly two lines/);
  assert.match(rules, /Every outgoing arrow inherits the color and line style of its source card/);
  assert.match(rules, /Blocked/);
  assert.match(rules, /flow graph --path \./);
  assert.match(rules, /curve: 'linear'/);
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
  await fs.writeFile(
    path.join(installed, 'package.json'),
    JSON.stringify({ name: '@caiqueoak/flow', version: '9.9.9' })
  );
  await fs.writeFile(path.join(installed, 'skills', 'flow', 'SKILL.md'), '# Flow\n\nupdated skill');

  const bin = path.join(project, 'fake-bin');
  const invocation = path.join(project, 'npm-invocation.txt');
  await fs.mkdir(bin, { recursive: true });
  if (process.platform === 'win32') {
    await fs.writeFile(
      path.join(bin, 'npm.cmd'),
      '@echo off\r\necho %* > "%FLOW_TEST_NPM_INVOCATION%"\r\nexit /b 0\r\n'
    );
  } else {
    const npm = path.join(bin, 'npm');
    await fs.writeFile(npm, '#!/bin/sh\nprintf "%s" "$*" > "$FLOW_TEST_NPM_INVOCATION"\nexit 0\n');
    await fs.chmod(npm, 0o755);
  }

  const result = await run(['update', '--path', project], project, {
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, FLOW_TEST_NPM_INVOCATION: invocation }
  });
  assert.match(result.stdout, /project installation/);
  assert.match(result.stdout, /Flow updated to 9.9.9/);
  assert.match(await fs.readFile(invocation, 'utf8'), /^update @caiqueoak\/flow\s*$/);
  assert.doesNotMatch(result.stderr, /DEP0190/);
  assert.match(await fs.readFile(path.join(project, '.codex', 'skills', 'flow', 'SKILL.md'), 'utf8'), /updated skill/);
  assert.match(await fs.readFile(path.join(project, '.flow', 'config.yaml'), 'utf8'), /version: 9.9.9/);
});

test('repairs a Flow package that diverges from its lockfile before updating', async () => {
  const project = await tempDir();
  await run(['init', '--path', project, '--runtime', 'codex']);
  const installed = path.join(project, 'node_modules', '@caiqueoak', 'flow');
  await fs.mkdir(path.join(installed, 'skills', 'flow'), { recursive: true });
  await fs.writeFile(
    path.join(installed, 'package.json'),
    JSON.stringify({ name: '@caiqueoak/flow', version: '9.9.8' })
  );
  await fs.writeFile(path.join(installed, 'skills', 'flow', 'SKILL.md'), '# Flow\n\nstale skill');
  await fs.writeFile(
    path.join(project, 'package-lock.json'),
    JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/@caiqueoak/flow': { version: '9.9.9' } } })
  );

  const bin = path.join(project, 'fake-bin');
  const invocation = path.join(project, 'npm-invocation.txt');
  await fs.mkdir(bin, { recursive: true });
  if (process.platform === 'win32') {
    await fs.writeFile(
      path.join(bin, 'npm.cmd'),
      '@echo off\r\necho %*>> "%FLOW_TEST_NPM_INVOCATION%"\r\nif "%1"=="install" (\r\n  mkdir "%FLOW_TEST_PACKAGE_ROOT%\\skills\\flow" 2>NUL\r\n  > "%FLOW_TEST_PACKAGE_ROOT%\\package.json" echo {"name":"@caiqueoak/flow","version":"9.9.9"}\r\n  > "%FLOW_TEST_PACKAGE_ROOT%\\skills\\flow\\SKILL.md" echo # Flow updated skill\r\n)\r\nexit /b 0\r\n'
    );
  } else {
    const npm = path.join(bin, 'npm');
    await fs.writeFile(
      npm,
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$FLOW_TEST_NPM_INVOCATION"\nif [ "$1" = install ]; then\n  mkdir -p "$FLOW_TEST_PACKAGE_ROOT/skills/flow"\n  printf "%s" \'{"name":"@caiqueoak/flow","version":"9.9.9"}\' > "$FLOW_TEST_PACKAGE_ROOT/package.json"\n  printf "%s" "# Flow updated skill" > "$FLOW_TEST_PACKAGE_ROOT/skills/flow/SKILL.md"\nfi\nexit 0\n'
    );
    await fs.chmod(npm, 0o755);
  }

  const result = await run(['update', '--path', project], project, {
    env: {
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      FLOW_TEST_NPM_INVOCATION: invocation,
      FLOW_TEST_PACKAGE_ROOT: installed
    }
  });
  assert.match(result.stdout, /Repairing divergent/);
  assert.match(await fs.readFile(invocation, 'utf8'), /install[\r\n]+update @caiqueoak\/flow/);
  assert.equal(JSON.parse(await fs.readFile(path.join(installed, 'package.json'), 'utf8')).version, '9.9.9');
  assert.match(await fs.readFile(path.join(installed, 'skills', 'flow', 'SKILL.md'), 'utf8'), /updated skill/);
  assert.equal(
    (await fs.readdir(project)).some((entry) => entry.startsWith('.flow-update-backup-')),
    false
  );
});

test('updates the global installation when the invoked CLI is global', async () => {
  const project = await tempDir();
  await run(['init', '--path', project, '--runtime', 'codex']);
  const globalNodeModules = path.join(await tempDir(), 'node_modules');
  const globalPackage = path.join(globalNodeModules, '@caiqueoak', 'flow');
  await fs.mkdir(globalPackage, { recursive: true });
  await fs.cp(path.join(root, 'src'), path.join(globalPackage, 'src'), { recursive: true });
  await fs.cp(path.join(root, 'skills'), path.join(globalPackage, 'skills'), { recursive: true });
  await fs.copyFile(path.join(root, 'package.json'), path.join(globalPackage, 'package.json'));

  const bin = path.join(project, 'fake-bin');
  const invocation = path.join(project, 'npm-invocation.txt');
  await fs.mkdir(bin, { recursive: true });
  if (process.platform === 'win32') {
    await fs.writeFile(
      path.join(bin, 'npm.cmd'),
      '@echo off\r\nif "%1"=="root" (\r\n  echo %FLOW_TEST_GLOBAL_NODE_MODULES%\r\n  exit /b 0\r\n)\r\necho %* > "%FLOW_TEST_NPM_INVOCATION%"\r\nexit /b 0\r\n'
    );
  } else {
    const npm = path.join(bin, 'npm');
    await fs.writeFile(
      npm,
      '#!/bin/sh\nif [ "$1" = root ]; then\n  printf "%s" "$FLOW_TEST_GLOBAL_NODE_MODULES"\n  exit 0\nfi\nprintf "%s" "$*" > "$FLOW_TEST_NPM_INVOCATION"\n'
    );
    await fs.chmod(npm, 0o755);
  }

  const result = await run(['update', '--path', project], project, {
    cliPath: path.join(globalPackage, 'src', 'cli.mjs'),
    env: {
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      FLOW_TEST_GLOBAL_NODE_MODULES: globalNodeModules,
      FLOW_TEST_NPM_INVOCATION: invocation
    }
  });
  assert.match(result.stdout, /global installation/);
  assert.match(await fs.readFile(invocation, 'utf8'), /^update --global @caiqueoak\/flow\s*$/);
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
