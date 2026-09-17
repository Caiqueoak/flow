import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseGates, type GateDefinition, type GateStage } from '../../domain/gate/gate-definition.mjs';

export interface GateFilters {
  ids?: string[];
  task?: string | null;
  workItem?: string | null;
  stage?: GateStage | null;
  all?: boolean;
}

export interface GateResult {
  id: string;
  kind: string;
  blocking: boolean;
  status: string;
  duration_ms?: number;
  exit_code?: number | null;
  stdout?: string;
  stderr?: string;
  violations?: string[];
  message?: string;
}

function runCommandGate(root: string, gate: GateDefinition & { command: string }): GateResult {
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

function runBuiltinGate(root: string, gate: GateDefinition): GateResult {
  if (gate.rule !== 'kebab-case-files')
    return {
      id: gate.id,
      kind: gate.kind,
      blocking: gate.blocking,
      status: 'unsupported',
      message: `Unknown builtin rule '${gate.rule}'.`
    };
  const excluded = new Set(['.git', '_flow', 'node_modules']);
  const violations: string[] = [];
  function walk(directory: string): void {
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
      if (/^[A-Z0-9_.-]+$/.test(stem)) continue;
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

export function selectGates(
  gates: readonly GateDefinition[],
  { ids = [], task = null, workItem = null, stage = null, all = false }: GateFilters = {}
): GateDefinition[] {
  return gates.filter((gate) => {
    if (ids.length && !ids.includes(gate.id)) return false;
    if (stage && gate.stage !== stage) return false;
    if (all) return true;
    if (task)
      return (
        (gate.scope.tasks ?? []).includes(task) ||
        (gate.scope.work_items ?? []).includes(task.split('-T')[0] ?? task) ||
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

export function evaluateGates(root: string, filters: GateFilters = { all: true }): GateResult[] {
  const file = path.join(root, '_flow', 'gates.yaml');
  if (!fs.existsSync(file)) throw new Error('gates.yaml does not exist.');
  const { gates } = parseGates(fs.readFileSync(file, 'utf8'));
  return selectGates(gates, filters).map((gate) => {
    const startedAt = performance.now();
    let result: GateResult;
    if (gate.kind === 'command') result = runCommandGate(root, gate as GateDefinition & { command: string });
    else if (gate.kind === 'builtin') result = runBuiltinGate(root, gate);
    else throw new Error(`Unsupported gate kind '${gate.kind}'.`);
    return { ...result, duration_ms: Math.round(performance.now() - startedAt) };
  });
}
