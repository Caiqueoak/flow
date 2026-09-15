import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { info, fail } from '../shared/cli-io.mjs';
import { projectRoot } from '../shared/project-path.mjs';
import { readConfig } from '../shared/project-config.mjs';
import { parseBacklog, deriveExecutionStatus } from '../artifacts/backlog.mjs';
import { parseTasks, qualifiedTaskId } from '../artifacts/tasks.mjs';
import { parseState } from '../artifacts/state.mjs';
import { parseGates } from '../artifacts/gates.mjs';
import { validateEngineeringDocument } from '../artifacts/engineering.mjs';
import { validatePrdDocument } from '../artifacts/prd.mjs';
import { validateImplementationPlan } from '../artifacts/implementation-plan.mjs';
import { traceTasks, gitObjectIdFormat } from './trace.mjs';
import { generateGraphMarkdown } from './graph.mjs';
import { evaluateGates } from './gates.mjs';
import { validateSpec } from '../artifacts/spec.mjs';
import { FLOW_SCHEMA_VERSION } from '../domain/contracts.mjs';

export function validateProject(
  root,
  { preCommitTask = null, skipTrace = false, evaluateConfiguredGates = false, onGateResults, workItem = null } = {}
) {
  const findings = [];
  const error = (code, message) => findings.push({ level: 'error', code, message });
  const flow = path.join(root, '_flow');
  const exists = (relative) => fs.existsSync(path.join(flow, relative));
  const hasExactRootEntry = (name) => fs.readdirSync(flow).includes(name);
  const read = (relative) => fs.readFileSync(path.join(flow, relative), 'utf8');
  let config;
  try {
    config = readConfig(root);
  } catch (failure) {
    error('CONFIG', failure.message);
  }
  if (!config || config.schema_version !== FLOW_SCHEMA_VERSION) {
    error('CONFIG', 'Initialize Flow or migrate the existing project.');
    return findings;
  }
  if (
    config.engineering.profile !== 'flow/readability-first@1' ||
    !['improve', 'preserve', 'not_applicable'].includes(config.engineering.existing_code_policy)
  )
    error('CONFIG', 'Invalid engineering bootstrap preferences.');
  for (const name of ['STATE.md', 'DECISIONS.md', 'SUMMARY.md', 'BACKLOG.yaml', 'PRD.md', 'ENGINEERING.md', 'GRAPH.md'])
    if (hasExactRootEntry(name)) error('LEGACY', `${name} must be migrated.`);
  let state;
  try {
    state = exists('state.yaml') ? parseState(read('state.yaml')) : null;
  } catch (failure) {
    error('STATE', failure.message);
  }
  const migrationPending = state?.migration.status === 'pending_reconciliation';
  const backlogRequired = ['backlog', 'specification', 'planning', 'implementation', 'review', 'complete'].includes(
    state?.execution.phase
  );
  if (!exists('backlog.yaml')) {
    if (backlogRequired) error('MISSING', 'Missing backlog.yaml.');
    return findings;
  }
  let backlog;
  try {
    backlog = parseBacklog(read('backlog.yaml'));
  } catch (failure) {
    error('BACKLOG', failure.message);
    return findings;
  }
  const anyStarted = backlog.work_items.some((item) => item.state !== 'pending');
  if (!migrationPending) {
    for (const [name, validator] of [
      ['prd.md', validatePrdDocument],
      ['engineering.md', validateEngineeringDocument]
    ]) {
      if (!exists(`docs/${name}`)) {
        error('MISSING', `Missing docs/${name}.`);
        continue;
      }
      const document = validator(read(`docs/${name}`));
      for (const message of document.errors) error('DOCUMENT', `${name}: ${message}`);
      if (anyStarted && document.status !== 'approved')
        error('APPROVAL', `${name} must be approved before implementation.`);
    }
  }
  const byId = new Map(backlog.work_items.map((item) => [item.id, item]));
  let activeTasks = 0;
  let preCommitRecord = null;
  const traceCandidates = [];
  for (const item of backlog.work_items) {
    if (
      workItem &&
      item.id !== workItem &&
      !item.depends_on.includes(workItem) &&
      !findings.some((finding) => finding.code === 'BACKLOG')
    )
      continue;
    const base = `work-items/${item.folder}`;
    if (item.spec_maturity === 'outlined') {
      if (item.state !== 'pending') error('STATE', `${item.id}: outlined work cannot be active or completed.`);
      if (exists(`${base}/tasks.yaml`) || exists(`${base}/implementation-plan.md`))
        error('WORK_ITEM', `${item.id}: outlined work cannot have tasks or an implementation plan.`);
      continue;
    }
    if (!exists(`${base}/spec.md`)) {
      error('WORK_ITEM', `${item.id} is ready but missing spec.md.`);
      continue;
    }
    if (!exists(`${base}/tasks.yaml`)) {
      if (item.state !== 'pending') error('WORK_ITEM', `${item.id} is missing tasks.yaml.`);
      continue;
    }
    let tasks;
    try {
      tasks = parseTasks(read(`${base}/tasks.yaml`), { expectedWorkItem: item.id });
    } catch (failure) {
      error('TASKS', failure.message);
      continue;
    }
    const historical = tasks.tasks.length > 0 && tasks.tasks.every((task) => task.traceability === 'legacy');
    activeTasks += tasks.tasks.filter((task) => task.state === 'in_progress').length;
    if (tasks.tasks.some((task) => task.state === 'in_progress') && item.state !== 'in_progress')
      error('STATE', `${item.id}: active task requires active work item.`);
    if (item.state === 'completed' && tasks.tasks.some((task) => task.state !== 'completed'))
      error('STATE', `${item.id}: completed work has incomplete tasks.`);
    if (item.state === 'in_progress' && deriveExecutionStatus(item, byId).status === 'blocked')
      error('STATE', `${item.id}: active work is blocked.`);
    if (!historical && !migrationPending) {
      const spec = read(`${base}/spec.md`);
      for (const message of validateSpec(spec).errors) error('SPEC', `${item.id}: ${message}`);
      const planPath = `${base}/implementation-plan.md`;
      if (!exists(planPath)) {
        if (item.state !== 'pending') error('PLAN', `${item.id} requires an approved implementation plan.`);
      } else if (exists('docs/engineering.md')) {
        const plan = validateImplementationPlan(read(planPath), {
          workItem: item.id,
          engineeringText: read('docs/engineering.md'),
          specText: spec,
          checkRevisions: item.state !== 'completed'
        });
        for (const message of plan.errors) error('PLAN', `${item.id}: ${message}`);
        if (item.state !== 'pending' && plan.status !== 'approved') error('PLAN', `${item.id}: plan is not approved.`);
      }
    }
    for (const task of tasks.tasks)
      if (qualifiedTaskId(item.id, task.id) === preCommitTask) preCommitRecord = { item, task };
    for (const task of tasks.tasks)
      if (task.state === 'completed' && task.traceability === 'commit' && !skipTrace) {
        const qualified = qualifiedTaskId(item.id, task.id);
        if (qualified !== preCommitTask) traceCandidates.push({ qualified, persisted: task.commit_sha });
      }
  }
  if (preCommitTask) {
    if (!preCommitRecord) error('SCOPE', `${preCommitTask}: task does not exist.`);
    else if (preCommitRecord.task.state !== 'in_progress')
      error('SCOPE', `${preCommitTask}: task must be in_progress for pre-commit validation.`);
    else {
      try {
        const staged = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { cwd: root, encoding: 'utf8' })
          .split('\0')
          .filter(Boolean);
        if (preCommitRecord.task.traceability === 'commit' && !staged.length)
          error('SCOPE', `${preCommitTask}: implementation commit has no staged changes.`);
        if (preCommitRecord.task.traceability === 'none' && staged.length)
          error('SCOPE', `${preCommitTask}: traceability none cannot have staged repository changes.`);
        const administrative = staged.filter((file) =>
          /(^|\/)_flow\/(?:state\.yaml|backlog\.yaml|docs\/graph\.md|.*tasks\.yaml)$/.test(file.replace(/\\/g, '/'))
        );
        if (administrative.length)
          error(
            'SCOPE',
            `${preCommitTask}: administrative Flow metadata must not be in the implementation commit: ${administrative.join(', ')}.`
          );
      } catch (failure) {
        error('SCOPE', `${preCommitTask}: cannot inspect staged Git diff: ${failure.message}`);
      }
    }
  }
  if (traceCandidates.length) {
    try {
      const objectFormat = gitObjectIdFormat(root);
      for (const candidate of traceCandidates)
        if (candidate.persisted?.length !== objectFormat.hexadecimal_length)
          error('TRACE', `${candidate.qualified}: commit_sha is not a full ${objectFormat.algorithm} object ID.`);
      for (const [qualified, result] of traceTasks(
        root,
        traceCandidates.map((candidate) => candidate.qualified)
      )) {
        if (result.status !== 'resolved')
          error('TRACE', `${qualified}: expected exactly one HEAD-reachable commit with both Flow trailers.`);
        else {
          const persisted = traceCandidates.find((candidate) => candidate.qualified === qualified)?.persisted;
          if (persisted !== result.commit.sha)
            error(
              'TRACE_DIVERGENCE',
              `${qualified}: persisted SHA ${persisted} differs from reachable ${result.commit.sha}.`
            );
        }
      }
    } catch (failure) {
      for (const { qualified } of traceCandidates) error('TRACE', `${qualified}: ${failure.message}`);
    }
  }
  if (activeTasks > 1) error('STATE', 'Only one mutating task may be active across the project.');
  if (exists('gates.yaml')) {
    try {
      parseGates(read('gates.yaml'));
      if (!migrationPending && evaluateConfiguredGates) {
        const gateResults = evaluateGates(root, { all: true });
        onGateResults?.(gateResults);
        for (const gate of gateResults)
          if (gate.blocking && ['failed', 'unsupported'].includes(gate.status))
            error('GATE', `${gate.id}: ${gate.status}`);
      }
    } catch (failure) {
      error('GATES', failure.message);
    }
  } else if (!migrationPending) error('MISSING', 'Missing gates.yaml.');
  if (!exists('docs/graph.md') || read('docs/graph.md') !== generateGraphMarkdown(read('backlog.yaml')))
    error('GRAPH', 'Graph is stale; run npx --no-install flow graph.');
  return findings;
}
export function runValidate({ args }) {
  const startedAt = performance.now();
  const index = args.indexOf('--pre-commit');
  const workItemIndex = args.indexOf('--work-item');
  const includeGates = args.includes('--gates');
  let gateResults = [];
  const findings = validateProject(projectRoot(args), {
    preCommitTask: index < 0 ? null : args[index + 1],
    workItem: workItemIndex < 0 ? null : args[workItemIndex + 1],
    skipTrace: args.includes('--skip-trace'),
    evaluateConfiguredGates: includeGates,
    onGateResults: (results) => {
      gateResults = results;
    }
  });
  if (args.includes('--json')) {
    const metrics = {
      duration_ms: Math.round(performance.now() - startedAt),
      processes: includeGates ? gateResults.filter((gate) => gate.kind === 'command').length : 0,
      git_reads: findings.filter((finding) => ['TRACE', 'TRACE_DIVERGENCE', 'SCOPE'].includes(finding.code)).length,
      validations: findings.length + 1,
      gates_executed: gateResults.length
    };
    info(
      JSON.stringify(
        { valid: findings.length === 0, findings, metrics, ...(includeGates ? { gates: gateResults } : {}) },
        null,
        2
      )
    );
    if (findings.length) process.exitCode = 1;
    return;
  }
  if (!findings.length) return info('Flow project is valid.');
  for (const finding of findings) info(`${finding.code}: ${finding.message}`);
  fail(`${findings.length} validation finding(s).`);
}
