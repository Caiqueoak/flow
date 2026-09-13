import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
const cli = path.resolve('src/cli.mjs');
function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}
function root() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flow-cli-'));
}
test('version source and simplified command help', () => {
  assert.equal(
    execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' }).trim(),
    JSON.parse(fs.readFileSync('package.json', 'utf8')).version
  );
  const help = run(['--help']);
  assert.match(help.stdout, /npx --no-install flow/);
  assert.match(help.stdout, /Readability First/);
  for (const cmd of ['update', 'gates', 'config']) assert.equal(run([cmd]).status, 1);
});
test('init writes the one profile and installs its agent-readable template', () => {
  const value = root();
  const result = run(['init', '--path', value, '--runtime', 'codex', '--existing-code', 'improve']);
  assert.equal(result.status, 0, result.stderr);
  const config = parse(fs.readFileSync(path.join(value, '.flow/config.yaml'), 'utf8'));
  assert.equal(config.engineering.profile, 'flow/readability-first@1');
  assert.equal(config.engineering.existing_code_policy, 'improve');
  assert.equal(config.parallelism, undefined);
  assert.equal(config.framework, undefined);
  assert.ok(fs.existsSync(path.join(value, '.codex/skills/flow/engineering/profiles/readability-first.md')));
});
test('init refuses old config with zero mutation', () => {
  const value = root();
  fs.mkdirSync(path.join(value, '.flow'));
  const old = 'schema_version: 1\nruntimes: []\n';
  fs.writeFileSync(path.join(value, '.flow/config.yaml'), old);
  const result = run(['init', '--path', value, '--runtime', 'codex']);
  assert.equal(result.status, 1);
  assert.equal(fs.readFileSync(path.join(value, '.flow/config.yaml'), 'utf8'), old);
  assert.deepEqual(fs.readdirSync(path.join(value, '.flow')), ['config.yaml']);
});
test('established engineering cannot change through init; runtimes can be added', () => {
  const value = root();
  assert.equal(run(['init', '--path', value, '--runtime', 'codex']).status, 0);
  const file = path.join(value, '.flow/config.yaml');
  const before = fs.readFileSync(file, 'utf8');
  assert.equal(run(['init', '--path', value, '--runtime', 'claude', '--existing-code', 'preserve']).status, 1);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(run(['init', '--path', value, '--runtime', 'claude']).status, 0);
  assert.ok(fs.existsSync(path.join(value, '.claude/skills/flow/SKILL.md')));
});
test('init refreshes configured skills and removes obsolete instructions', () => {
  const value = root();
  run(['init', '--path', value, '--runtime', 'codex']);
  const old = path.join(value, '.codex/skills/flow/obsolete.md');
  fs.writeFileSync(old, 'old');
  assert.equal(run(['init', '--path', value, '--runtime', 'codex']).status, 0);
  assert.equal(fs.existsSync(old), false);
});
test('unknown profile, runtime and old brownfield flag fail safely', () => {
  for (const args of [
    ['--profile', 'magic'],
    ['--runtime', 'unknown'],
    ['--brownfield', 'rebaseline']
  ]) {
    const value = root();
    const result = run(['init', '--path', value, ...(args[0] === '--runtime' ? [] : ['--runtime', 'codex']), ...args]);
    assert.equal(result.status, 1);
    assert.equal(fs.existsSync(path.join(value, '.flow/config.yaml')), false);
  }
});
