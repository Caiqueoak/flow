import fs from 'node:fs';
import path from 'node:path';
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
import { traceTask } from './trace.mjs';
import { generateGraphMarkdown } from './graph.mjs';
import { evaluateGates } from './gates.mjs';

export function validateProject(root, { preCommitTask = null, skipTrace = false } = {}) {
  const findings = [];
  const error = (code, message) => findings.push({ level: 'error', code, message });
  const flow = path.join(root, '.flow');
  const exists = (relative) => fs.existsSync(path.join(flow, relative));
  const read = (relative) => fs.readFileSync(path.join(flow, relative), 'utf8');
  let config;
  try {
    config = readConfig(root);
  } catch (failure) {
    error('CONFIG', failure.message);
  }
  if (!config || config.schema_version !== 2) {
    error('CONFIG', 'Initialize Flow or migrate the existing project.');
    return findings;
  }
  if (
    config.engineering.profile !== 'flow/readability-first@1' ||
    !['improve', 'preserve', 'not_applicable'].includes(config.engineering.existing_code_policy)
  )
    error('CONFIG', 'Invalid engineering bootstrap preferences.');
  for (const name of ['STATE.md', 'DECISIONS.md', 'SUMMARY.md', 'BACKLOG.yaml', 'PRD.md', 'ENGINEERING.md', 'GRAPH.md'])
    if (exists(name)) error('LEGACY', `${name} must be migrated.`);
  let state;
  try {
    state = exists('state.yaml') ? parseState(read('state.yaml')) : null;
  } catch (failure) {
    error('STATE', failure.message);
  }
  const migrationPending = state?.migration.status === 'pending_reconciliation';
  const backlogRequired = [
    'backlog_planning',
    'work_item_plan_approval',
    'implementation',
    'work_item_review',
    'complete'
  ].includes(state?.execution.phase);
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
  for (const item of backlog.work_items) {
    const base = `work-items/${item.folder}`;
    const missing = ['spec.md', 'tasks.yaml'].filter((name) => !exists(`${base}/${name}`));
    if (missing.length) {
      if (!(migrationPending && item.state === 'pending'))
        error('WORK_ITEM', `${item.id} is missing ${missing.join(', ')}.`);
      continue;
    }
    let tasks;
    try {
      tasks = parseTasks(read(`${base}/tasks.yaml`), { expectedWorkItem: item.id });
    } catch (failure) {
      error('TASKS', failure.message);
      continue;
    }
    const historical = tasks.tasks.length > 0 && tasks.tasks.every((task) => task.implementation === 'legacy');
    activeTasks += tasks.tasks.filter((task) => task.state === 'in_progress').length;
    if (tasks.tasks.some((task) => task.state === 'in_progress') && item.state !== 'in_progress')
      error('STATE', `${item.id}: active task requires active work item.`);
    if (item.state === 'completed' && tasks.tasks.some((task) => task.state !== 'completed'))
      error('STATE', `${item.id}: completed work has incomplete tasks.`);
    if (item.state === 'in_progress' && deriveExecutionStatus(item, byId).status === 'blocked')
      error('STATE', `${item.id}: active work is blocked.`);
    if (!historical && !migrationPending) {
      const spec = read(`${base}/spec.md`);
      for (const heading of [
        '## Status',
        '## Goal',
        '## Scope',
        '## Non-goals',
        '## Requirements',
        '## Acceptance criteria',
        '## Decisions'
      ])
        if (!spec.split(/\r?\n/).includes(heading)) error('SPEC', `${item.id} missing ${heading}.`);
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
    for (const task of tasks.tasks) {
      if (task.state !== 'completed' || task.implementation !== 'commit' || skipTrace) continue;
      const qualified = qualifiedTaskId(item.id, task.id);
      if (qualified === preCommitTask) continue;
      try {
        if (traceTask(root, qualified).status !== 'resolved')
          error('TRACE', `${qualified}: expected exactly one HEAD-reachable commit with both Flow trailers.`);
      } catch (failure) {
        error('TRACE', failure.message);
      }
    }
  }
  if (activeTasks > 1) error('STATE', 'Only one mutating task may be active across the project.');
  if (exists('gates.yaml')) {
    try {
      parseGates(read('gates.yaml'));
      if (!migrationPending)
        for (const gate of evaluateGates(root))
          if (gate.blocking && ['failed', 'unsupported'].includes(gate.status))
            error('GATE', `${gate.id}: ${gate.status}`);
    } catch (failure) {
      error('GATES', failure.message);
    }
  } else if (!migrationPending) error('MISSING', 'Missing gates.yaml.');
  if (!exists('docs/graph.md') || read('docs/graph.md') !== generateGraphMarkdown(read('backlog.yaml')))
    error('GRAPH', 'Graph is stale; run npx --no-install flow graph.');
  return findings;
}
export function runValidate({ args }) {
  const index = args.indexOf('--pre-commit');
  const findings = validateProject(projectRoot(args), {
    preCommitTask: index < 0 ? null : args[index + 1],
    skipTrace: args.includes('--skip-trace')
  });
  if (args.includes('--json')) {
    info(JSON.stringify({ valid: findings.length === 0, findings }, null, 2));
    if (findings.length) process.exitCode = 1;
    return;
  }
  if (!findings.length) return info('Flow project is valid.');
  for (const finding of findings) info(`${finding.code}: ${finding.message}`);
  fail(`${findings.length} validation finding(s).`);
}
