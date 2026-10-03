import fs from 'node:fs';
import path from 'node:path';

export type Telemetry =
  | { status: 'unavailable' }
  | {
      status: 'available';
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      billed_cost?: number;
    };

type Assertion = { path: string; operator: 'eq'; expected: unknown };
type RubricItem = { id: string; max_score: number; description: string };
type Fixture = {
  id: string;
  title: string;
  agent_context: Record<string, unknown>;
  workspace_files?: Record<string, string>;
};
type Truth = {
  id: string;
  hard_assertions: Assertion[];
  rubric: RubricItem[];
  seeded_truth?: Record<string, unknown>;
};

export type RunIdentity = {
  benchmark_id: string;
  flow_revision: string;
  runtime: string | null;
  model: string | null;
  config: string | null;
  repeat: number;
};

export type BenchmarkObservation = {
  facts: Record<string, unknown>;
  metrics?: {
    user_interventions?: number;
    delegation_decision?: string;
    parallelism_decision?: string;
    worker_count?: number;
    seeded_defects_found?: string[];
    seeded_defects_missed?: string[];
    false_findings?: number;
    repair_passes?: number;
  };
  telemetry?: Telemetry;
  rubric_scores?: Record<string, number>;
  evaluator_notes?: string;
};

export function loadBenchmark(root: string, benchmarkId: string): { fixture: Fixture; truth: Truth } {
  const fixtures = readCollection<{ benchmarks: Fixture[] }>(path.join(root, 'benchmarks', 'fixtures.json'));
  const truths = readCollection<{ benchmarks: Truth[] }>(path.join(root, 'benchmarks', 'evaluator-truth.json'));
  const fixture = fixtures.benchmarks.find((item) => item.id === benchmarkId);
  const truth = truths.benchmarks.find((item) => item.id === benchmarkId);
  if (!fixture || !truth) throw new Error(`Unknown benchmark: ${benchmarkId}`);
  return { fixture, truth };
}

export function validateBenchmarkDefinitions(root: string): string[] {
  const fixtures = readCollection<{ schema_version: number; benchmarks: Fixture[] }>(
    path.join(root, 'benchmarks', 'fixtures.json')
  );
  const truths = readCollection<{ schema_version: number; benchmarks: Truth[] }>(
    path.join(root, 'benchmarks', 'evaluator-truth.json')
  );
  const issues: string[] = [];
  if (fixtures.schema_version !== 1 || truths.schema_version !== 1) issues.push('Benchmark schema_version must be 1.');
  const fixtureIds = fixtures.benchmarks.map((item) => item.id);
  const truthIds = truths.benchmarks.map((item) => item.id);
  if (new Set(fixtureIds).size !== fixtureIds.length) issues.push('Fixture benchmark IDs must be unique.');
  if (new Set(truthIds).size !== truthIds.length) issues.push('Evaluator benchmark IDs must be unique.');
  if (fixtureIds.join(',') !== truthIds.join(',')) issues.push('Fixture and evaluator benchmark IDs/order must match.');
  for (const truth of truths.benchmarks) {
    if (truth.hard_assertions.length === 0) issues.push(`${truth.id} must define at least one hard assertion.`);
    for (const item of truth.rubric) {
      if (!Number.isInteger(item.max_score) || item.max_score <= 0) issues.push(`${truth.id} rubric max_score is invalid.`);
    }
  }
  return issues;
}

export function prepareRun(
  repoRoot: string,
  runsRoot: string,
  runId: string,
  identity: RunIdentity
): string {
  const { fixture } = loadBenchmark(repoRoot, identity.benchmark_id);
  const runRoot = path.resolve(runsRoot, runId);
  const resolvedRunsRoot = path.resolve(runsRoot);
  assertChildPath(resolvedRunsRoot, runRoot);
  fs.mkdirSync(resolvedRunsRoot, { recursive: true });
  fs.mkdirSync(runRoot, { recursive: false });
  const workspace = path.join(runRoot, 'workspace');
  fs.mkdirSync(workspace);
  fs.writeFileSync(
    path.join(workspace, 'agent-context.json'),
    JSON.stringify({ id: fixture.id, title: fixture.title, agent_context: fixture.agent_context }, null, 2) + '\n'
  );
  for (const [relativePath, content] of Object.entries(fixture.workspace_files ?? {})) {
    const destination = path.resolve(workspace, relativePath);
    assertChildPath(workspace, destination);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  }
  fs.writeFileSync(
    path.join(runRoot, 'manifest.json'),
    JSON.stringify(
      {
        schema_version: 1,
        run_id: runId,
        ...identity,
        fixture: { id: fixture.id, title: fixture.title },
        result_status: 'pending',
        telemetry: { status: 'unavailable' }
      },
      null,
      2
    ) + '\n'
  );
  return runRoot;
}

export function evaluateRun(repoRoot: string, runRoot: string): Record<string, unknown> {
  const manifest = readCollection<Record<string, unknown>>(path.join(runRoot, 'manifest.json'));
  const benchmarkId = requireString(manifest.benchmark_id, 'manifest.benchmark_id');
  const { truth } = loadBenchmark(repoRoot, benchmarkId);
  const observation = readCollection<BenchmarkObservation>(path.join(runRoot, 'observation.json'));
  validateTelemetry(observation.telemetry);
  const hard_assertions = truth.hard_assertions.map((assertion) => {
    const actual = readPath(observation, assertion.path);
    const passed = Object.is(actual, assertion.expected);
    return { ...assertion, actual, passed };
  });
  const rubric_scores = validateRubricScores(truth.rubric, observation.rubric_scores);
  const result = {
    schema_version: 1,
    run_id: manifest.run_id,
    benchmark_id: benchmarkId,
    flow_revision: manifest.flow_revision,
    runtime: manifest.runtime ?? null,
    model: manifest.model ?? null,
    config: manifest.config ?? null,
    repeat: manifest.repeat,
    hard_pass: hard_assertions.every((item) => item.passed),
    hard_assertions,
    rubric: truth.rubric.map((item) => ({
      ...item,
      score: rubric_scores?.[item.id] ?? null,
      status: rubric_scores?.[item.id] === undefined ? 'pending' : 'scored'
    })),
    observation_facts: observation.facts,
    metrics: {
      user_interventions: observation.metrics?.user_interventions ?? null,
      delegation_decision: observation.metrics?.delegation_decision ?? null,
      parallelism_decision: observation.metrics?.parallelism_decision ?? null,
      worker_count: observation.metrics?.worker_count ?? null,
      seeded_defects_found: observation.metrics?.seeded_defects_found ?? null,
      seeded_defects_missed: observation.metrics?.seeded_defects_missed ?? null,
      false_findings: observation.metrics?.false_findings ?? null,
      repair_passes: observation.metrics?.repair_passes ?? null
    },
    telemetry: observation.telemetry ?? { status: 'unavailable' },
    evaluator_notes: observation.evaluator_notes ?? null
  };
  const resultFile = path.join(runRoot, 'result.json');
  if (fs.existsSync(resultFile)) throw new Error('result.json already exists; repeated runs must use a new run directory.');
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2) + '\n');
  return result;
}

function validateTelemetry(telemetry: Telemetry | undefined): void {
  if (!telemetry || telemetry.status === 'unavailable') return;
  for (const [key, value] of Object.entries(telemetry)) {
    if (key === 'status' || value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`Telemetry ${key} must be a finite non-negative number when available.`);
    }
  }
}

function validateRubricScores(
  rubric: RubricItem[],
  scores: Record<string, number> | undefined
): Record<string, number> | undefined {
  if (!scores) return undefined;
  for (const [id, score] of Object.entries(scores)) {
    const item = rubric.find((candidate) => candidate.id === id);
    if (!item) throw new Error(`Unknown rubric score: ${id}`);
    if (!Number.isInteger(score) || score < 0 || score > item.max_score) {
      throw new Error(`Rubric score ${id} must be an integer from 0 to ${item.max_score}.`);
    }
  }
  return scores;
}

function readPath(value: unknown, dottedPath: string): unknown {
  return dottedPath.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}

function readCollection<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string.`);
  return value;
}

function assertChildPath(parent: string, child: string): void {
  const relative = path.relative(parent, child);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Run directory must be a child of the configured runs root.');
  }
}
