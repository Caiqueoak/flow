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
  const excluded = new Set(['.git', '_flow', 'node_modules']);
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

export function selectGates(gates, { ids = [], task = null, workItem = null, stage = null, all = false } = {}) {
  return gates.filter((gate) => {
    if (ids.length && !ids.includes(gate.id)) return false;
    if (stage && gate.stage !== stage) return false;
    if (all) return true;
    if (task)
      return (
        (gate.scope.tasks ?? []).includes(task) ||
        (gate.scope.work_items ?? []).includes(task.split('-T')[0]) ||
        (gate.stage === 'task' && !Object.keys(gate.scope).length)
      );
    if (workItem)
      return (
        (gate.scope.work_items ?? []).includes(workItem) ||
        (gate.stage === 'work-item-review' && !Object.keys(gate.scope).length)
      );
    return ids.length > 0 || Boolean(stage);
  });
}

export function evaluateGates(root, filters = { all: true }) {
  const file = path.join(root, '_flow', 'gates.yaml');
  if (!fs.existsSync(file)) fail('gates.yaml does not exist.');
  const { gates } = parseGates(fs.readFileSync(file, 'utf8'));
  return selectGates(gates, filters).map((gate) => {
    const startedAt = performance.now();
    let result;
    if (gate.kind === 'command') result = runCommandGate(root, gate);
    else if (gate.kind === 'builtin') result = runBuiltinGate(root, gate);
    else throw new Error(`Unsupported gate kind '${gate.kind}'.`);
    return { ...result, duration_ms: Math.round(performance.now() - startedAt) };
  });
}

function option(args, name) {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1];
}

export function runGates({ args }) {
  const root = path.resolve(option(args, '--path') ?? process.cwd());
  const action = args.find((arg) => !arg.startsWith('-'));
  const file = path.join(root, '_flow', 'gates.yaml');
  if (!fs.existsSync(file)) fail('gates.yaml does not exist.');
  const parsed = parseGates(fs.readFileSync(file, 'utf8'));
  const filters = {
    ids: option(args, '--id')?.split(',') ?? [],
    task: option(args, '--task'),
    workItem: option(args, '--work-item'),
    stage: option(args, '--stage'),
    all: args.includes('--all')
  };
  const hasFilter = filters.ids.length || filters.task || filters.workItem || filters.stage || filters.all;
  if (action === 'list' && !hasFilter) filters.all = true;
  const selected = selectGates(parsed.gates, filters);
  if (action === 'list') {
    const output = args.includes('--json')
      ? JSON.stringify(selected, null, 2)
      : selected.map((gate) => `${gate.id}\t${gate.stage}\t${gate.cost}\t${gate.command ?? gate.rule}`).join('\n');
    return console.log(output);
  }
  if (action !== 'run') fail("flow gates requires 'list' or 'run'.");
  if (!selected.length) fail('No gates matched; use --all or a scope filter.');
  const results = evaluateGates(root, filters);
  if (args.includes('--json')) console.log(JSON.stringify(results, null, 2));
  else
    for (const result of results) console.log(`${result.status.toUpperCase()} ${result.id} (${result.duration_ms}ms)`);
  if (results.some((result) => result.blocking && result.status !== 'passed')) process.exitCode = 1;
}
