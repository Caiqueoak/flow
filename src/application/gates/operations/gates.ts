import path from 'node:path';
import { parseGates } from '../../../domain/gate/gate-definition.mjs';
import { fail, projectRoot, recordOutput as writeOutput, setExitCode } from '../../command-runtime.js';
import { evaluateGates, selectGates } from '../../../infrastructure/process/gate-evaluation.mjs';
import { fileExists, readText } from '../../../infrastructure/filesystem/index.js';

interface GateFilters {
  ids: string[];
  task: string | null;
  workItem: string | null;
  stage: string | null;
  all: boolean;
}

interface GateView {
  id: string;
  stage: string;
  cost: string;
  command?: string;
  rule?: string;
}

interface GateResult {
  id: string;
  status: string;
  blocking: boolean;
  duration_ms: number;
}

type SelectGates = (gates: unknown[], filters: GateFilters) => GateView[];
type EvaluateGates = (root: string, filters: GateFilters) => GateResult[];

const selectGatesBoundary = selectGates as unknown as SelectGates;
const evaluateGatesBoundary = evaluateGates as unknown as EvaluateGates;

export function listGates(args: readonly string[]): void {
  const { selected } = loadSelectedGates(args, true);
  const output = args.includes('--json') ? JSON.stringify(selected, null, 2) : formatGates(selected);

  writeOutput(output);
}

export function runGates(args: readonly string[]): void {
  const { root, filters, selected } = loadSelectedGates(args, false);

  if (!selected.length) {
    fail('No gates matched; use --all or a scope filter.');
  }

  const results = evaluateGatesBoundary(root, filters);

  if (args.includes('--json')) {
    writeOutput(JSON.stringify(results, null, 2));
  } else {
    for (const result of results) {
      writeOutput(`${result.status.toUpperCase()} ${result.id} (${result.duration_ms}ms)`);
    }
  }

  if (results.some((result) => result.blocking && result.status !== 'passed')) {
    setExitCode(1);
  }
}

function loadSelectedGates(
  args: readonly string[],
  defaultToAll: boolean
): {
  root: string;
  filters: GateFilters;
  selected: GateView[];
} {
  const root = projectRoot(args);
  const file = path.join(root, '_flow', 'gates.yaml');

  if (!fileExists(file)) {
    fail('gates.yaml does not exist.');
  }

  const filters = gateFilters(args);

  if (defaultToAll && !hasExplicitFilter(filters)) {
    filters.all = true;
  }

  const gates = parseGates(readText(file)).gates as unknown[];
  const selected = selectGatesBoundary(gates, filters);

  return { root, filters, selected };
}

function gateFilters(args: readonly string[]): GateFilters {
  return {
    ids: option(args, '--id')?.split(',') ?? [],
    task: option(args, '--task'),
    workItem: option(args, '--work-item'),
    stage: option(args, '--stage'),
    all: args.includes('--all')
  };
}

function hasExplicitFilter(filters: GateFilters): boolean {
  return Boolean(filters.ids.length || filters.task || filters.workItem || filters.stage || filters.all);
}

function formatGates(gates: GateView[]): string {
  return gates.map(formatGate).join('\n');
}

function formatGate(gate: GateView): string {
  return `${gate.id}\t${gate.stage}\t${gate.cost}\t${gate.command ?? gate.rule}`;
}

function option(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  return index < 0 ? null : (args[index + 1] ?? null);
}
