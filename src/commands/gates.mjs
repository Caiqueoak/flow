import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fail } from '../shared/cli-io.mjs';
import { parseGates } from '../artifacts/gates.mjs';

function runCommandGate(root, gate) {
  const shell = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : '/bin/sh';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', gate.command] : ['-lc', gate.command];
  const result = spawnSync(shell, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    id: gate.id,
    kind: gate.kind,
    blocking: gate.blocking,
    status: result.status === 0 ? 'passed' : 'failed',
    exit_code: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function runBuiltinGate(root, gate) {
  if (gate.rule !== 'kebab-case-files')
    return {
      id: gate.id,
      kind: gate.kind,
      blocking: gate.blocking,
      status: 'unsupported',
      message: `Unknown builtin rule '${gate.rule}'.`
    };
  const excluded = new Set(['.git', '.flow', 'node_modules']);
  const violations = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (excluded.has(entry.name)) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name.startsWith('.')) continue;
      const ext = path.extname(entry.name);
      const stem = ext ? entry.name.slice(0, -ext.length) : entry.name;
      if (/^[A-Z0-9_.-]+$/.test(entry.name)) continue;
      const valid = stem.split('.').every((segment) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment));
      if (!valid) violations.push(path.relative(root, full));
    }
  }
  walk(root);
  return {
    id: gate.id,
    kind: gate.kind,
    blocking: gate.blocking,
    status: violations.length ? 'failed' : 'passed',
    violations
  };
}

export function evaluateGates(root) {
  const file = path.join(root, '.flow', 'gates.yaml');
  if (!fs.existsSync(file)) fail('gates.yaml does not exist.');
  const { gates } = parseGates(fs.readFileSync(file, 'utf8'));
  return gates.map((gate) => {
    if (gate.kind === 'command') return runCommandGate(root, gate);
    if (gate.kind === 'builtin') return runBuiltinGate(root, gate);
    throw new Error(`Unsupported gate kind '${gate.kind}'.`);
  });
}
