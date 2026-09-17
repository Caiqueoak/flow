// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { fail, writeOutput } from '../../../cli/terminal/output.js';
import { projectRoot } from '../../../cli/command-input/project-root.js';
import { parseGates } from '../../../artifacts/gate-definitions.mjs';
import { evaluateGates, selectGates } from '../../../flow-project/gate-evaluation.mjs';

export { evaluateGates, selectGates } from '../../../flow-project/gate-evaluation.mjs';

export function runGates({ args }) {
  const root = projectRoot(args);
  const action = args.find((argument) => !argument.startsWith('-'));
  const file = path.join(root, '_flow', 'gates.yaml');
  if (!fs.existsSync(file)) fail('gates.yaml does not exist.');
  const filters = {
    ids: option(args, '--id')?.split(',') ?? [],
    task: option(args, '--task'),
    workItem: option(args, '--work-item'),
    stage: option(args, '--stage'),
    all: args.includes('--all')
  };
  if (action === 'list' && !(filters.ids.length || filters.task || filters.workItem || filters.stage || filters.all))
    filters.all = true;
  const selected = selectGates(parseGates(fs.readFileSync(file, 'utf8')).gates, filters);
  if (action === 'list')
    return writeOutput(
      args.includes('--json')
        ? JSON.stringify(selected, null, 2)
        : selected.map((gate) => `${gate.id}\t${gate.stage}\t${gate.cost}\t${gate.command ?? gate.rule}`).join('\n')
    );
  if (action !== 'run') fail("flow gates requires 'list' or 'run'.");
  if (!selected.length) fail('No gates matched; use --all or a scope filter.');
  const results = evaluateGates(root, filters);
  if (args.includes('--json')) writeOutput(JSON.stringify(results, null, 2));
  else
    for (const result of results) writeOutput(`${result.status.toUpperCase()} ${result.id} (${result.duration_ms}ms)`);
  if (results.some((result) => result.blocking && result.status !== 'passed')) process.exitCode = 1;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1];
}
