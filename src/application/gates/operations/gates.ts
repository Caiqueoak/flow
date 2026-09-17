import fs from 'node:fs';
import path from 'node:path';
import { parseGates } from '../../../artifacts/gate-definitions.mjs';
import { projectRoot } from '../../../cli/command-input/project-root.js';
import { fail, writeOutput } from '../../../cli/terminal/output.js';
import { evaluateGates, selectGates } from '../../../flow-project/gate-evaluation.mjs';

interface GateFilters {
  ids: string[];
  task: string | null;
  workItem: string | null;
  stage: string | null;
  all: boolean;
}

export function listGates(args: readonly string[]): void {
  const { selected } = loadSelectedGates(args, true);

  writeOutput(
    args.includes('--json')
      ? JSON.stringify(selected, null, 2)
      : selected.map((gate) => `${gate.id}\t${gate.stage}\t${gate.cost}\t${gate.command ?? gate.rule}`).join('\n')
  );
}

export function runGates(args: readonly string[]): void {
  const { root, filters, selected } = loadSelectedGates(args, false);

  if (!selected.length) {
    fail('No gates matched; use --all or a scope filter.');
  }

  const results = evaluateGates(root, filters);

  if (args.includes('--json')) {
    writeOutput(JSON.stringify(results, null, 2));
  } else {
    for (const result of results) {
      writeOutput(`${result.status.toUpperCase()} ${result.id} (${result.duration_ms}ms)`);
    }
  }

  if (results.some((result) => result.blocking && result.status !== 'passed')) {
    process.exitCode = 1;
  }
}

function loadSelectedGates(args: readonly string[], defaultToAll: boolean) {
  const root = projectRoot(args);
  const file = path.join(root, '_flow', 'gates.yaml');

  if (!fs.existsSync(file)) {
    fail('gates.yaml does not exist.');
  }

  const filters = gateFilters(args);

  if (defaultToAll && !hasExplicitFilter(filters)) {
    filters.all = true;
  }

  const selected = selectGates(parseGates(fs.readFileSync(file, 'utf8')).gates, filters);
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

function option(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  return index < 0 ? null : (args[index + 1] ?? null);
}
