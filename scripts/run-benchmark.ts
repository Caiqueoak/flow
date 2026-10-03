import path from 'node:path';
import process from 'node:process';
import {
  evaluateRun,
  prepareRun,
  validateBenchmarkDefinitions
} from '../src/infrastructure/evaluation/benchmark-harness.js';

const repoRoot = process.cwd();
const [command, ...args] = process.argv.slice(2);
const flags = parseFlags(args);

if (command === 'check') {
  const issues = validateBenchmarkDefinitions(repoRoot);
  if (issues.length > 0) {
    for (const issue of issues) console.error(issue);
    process.exitCode = 1;
  } else {
    console.log('Benchmark definitions valid.');
  }
} else if (command === 'prepare') {
  const benchmark = requireFlag(flags, 'benchmark');
  const repeat = Number(requireFlag(flags, 'repeat'));
  if (!Number.isInteger(repeat) || repeat < 1) throw new Error('--repeat must be a positive integer.');
  const runId = flags.get('run-id') ?? `${benchmark}-r${repeat}-${Date.now()}`;
  const runsRoot = path.resolve(flags.get('runs-root') ?? '.flow-evaluation/runs');
  const runRoot = prepareRun(repoRoot, runsRoot, runId, {
    benchmark_id: benchmark,
    flow_revision: requireFlag(flags, 'flow-revision'),
    runtime: flags.get('runtime') ?? null,
    model: flags.get('model') ?? null,
    config: flags.get('config') ?? null,
    repeat
  });
  console.log(runRoot);
} else if (command === 'evaluate') {
  const runRoot = path.resolve(requireFlag(flags, 'run'));
  const result = evaluateRun(repoRoot, runRoot);
  console.log(JSON.stringify(result, null, 2));
} else {
  console.error('Usage: npm run benchmark -- check | prepare --benchmark B01 --flow-revision <sha> --repeat 1 [--runtime id --model id --config id --run-id id --runs-root dir] | evaluate --run <run-dir>');
  process.exitCode = 1;
}

function parseFlags(values: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${key ?? '<end>'}.`);
    result.set(key.slice(2), value);
  }
  return result;
}

function requireFlag(flags: Map<string, string>, name: string): string {
  const value = flags.get(name);
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}
