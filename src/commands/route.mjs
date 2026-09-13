import fs from 'node:fs';
import path from 'node:path';
import { info } from '../shared/cli-io.mjs';
import { projectRoot } from '../shared/project-path.mjs';
import { readConfig } from '../shared/project-config.mjs';
import { parseBacklog, deriveExecutionStatus } from '../artifacts/backlog.mjs';
import { parseTasks, qualifiedTaskId } from '../artifacts/tasks.mjs';
import { validateEngineeringDocument } from '../artifacts/engineering.mjs';
import { validatePrdDocument } from '../artifacts/prd.mjs';
import { validateImplementationPlan } from '../artifacts/implementation-plan.mjs';
import { parseState } from '../artifacts/state.mjs';

function step(phase, instruction, extra = {}) {
  return { action: 'continue', phase, instruction, ...extra };
}
function awaitApproval(phase, instruction, extra = {}) {
  return { action: 'stop', reason: 'consequential_decision', phase, instruction, ...extra };
}
function artifactApproval(file, validator, phase, draftInstruction, approvalInstruction) {
  if (!fs.existsSync(file)) return step(phase, draftInstruction);
  const result = validator(fs.readFileSync(file, 'utf8'));
  if (result.errors.length) return step(phase, draftInstruction, { details: result.errors });
  if (result.status !== 'approved') return awaitApproval(phase, approvalInstruction);
  return null;
}
export function routeProject(root) {
  const flow = path.join(root, '.flow');
  const config = readConfig(root);
  if (!config) return { action: 'stop', reason: 'unrecoverable_blocker', details: 'Run npx --no-install flow init.' };
  if (config.schema_version !== 2)
    return { action: 'stop', reason: 'unrecoverable_blocker', details: 'Run npx --no-install flow migrate.' };
  const read = (relative) => fs.readFileSync(path.join(flow, relative), 'utf8');
  const exists = (relative) => fs.existsSync(path.join(flow, relative));
  const state = exists('state.yaml') ? parseState(read('state.yaml')) : null;
  if (state?.migration.status === 'pending_reconciliation')
    return step('migration_reconciliation', 'migration/step-01-reconcile.md', {
      required_context: [
        'backlog.yaml',
        'docs/prd.md',
        'docs/legacy-state.md',
        'docs/legacy-decisions.md',
        'docs/legacy-engineering.md'
      ]
        .filter(exists)
        .map((file) => `.flow/${file}`)
    });
  if (state?.stop_reason && state.stop_reason !== 'finished')
    return { action: 'stop', reason: state.stop_reason, phase: state.execution.phase, step: state.execution.step };
  const productRoute = artifactApproval(
    path.join(flow, 'docs/prd.md'),
    validatePrdDocument,
    'discovery',
    'discovery/step-01-project.md',
    'discovery/step-02-await-approval.md'
  );
  if (productRoute) return productRoute;
  const engineeringRoute = artifactApproval(
    path.join(flow, 'docs/engineering.md'),
    validateEngineeringDocument,
    'engineering',
    'engineering/step-02-synthesize.md',
    'engineering/step-05-present.md'
  );
  if (engineeringRoute) return engineeringRoute;
  const engineeringText = read('docs/engineering.md');
  const planning = () =>
    step('backlog_planning', 'planning/step-01-plan-work-item.md', {
      required_context: ['.flow/docs/prd.md', '.flow/docs/engineering.md']
    });
  if (!exists('backlog.yaml')) return planning();
  const backlog = parseBacklog(read('backlog.yaml'));
  for (const item of backlog.work_items) {
    if (!exists(`work-items/${item.folder}/spec.md`) || !exists(`work-items/${item.folder}/tasks.yaml`))
      return planning();
    parseTasks(read(`work-items/${item.folder}/tasks.yaml`), { expectedWorkItem: item.id });
  }
  const byId = new Map(backlog.work_items.map((item) => [item.id, item]));
  const active = backlog.work_items.find((item) => item.state === 'in_progress');
  if (active && deriveExecutionStatus(active, byId).status === 'blocked')
    return {
      action: 'stop',
      reason: 'external_action',
      work_item: active.id,
      details: deriveExecutionStatus(active, byId).reasons
    };
  const item =
    active ??
    backlog.work_items
      .filter((item) => deriveExecutionStatus(item, byId).status === 'ready')
      .sort((a, b) => a.priority - b.priority || Number(a.id.slice(1)) - Number(b.id.slice(1)))[0];
  if (!item)
    return {
      action: 'stop',
      reason: backlog.work_items.every((item) => item.state === 'completed') ? 'finished' : 'external_action'
    };
  const base = `work-items/${item.folder}`;
  const context = ['.flow/docs/engineering.md', `.flow/${base}/spec.md`, `.flow/${base}/tasks.yaml`];
  const tasks = parseTasks(read(`${base}/tasks.yaml`), { expectedWorkItem: item.id });
  const extra = { work_item: item.id, required_context: context };
  const prepare = () => step('work_item_plan_approval', 'planning/step-02-prepare-plan.md', extra);
  if (!exists(`${base}/implementation-plan.md`)) return prepare();
  const plan = validateImplementationPlan(read(`${base}/implementation-plan.md`), {
    workItem: item.id,
    engineeringText,
    specText: read(`${base}/spec.md`)
  });
  if (plan.errors.length) return prepare();
  if (plan.status !== 'approved')
    return awaitApproval('work_item_plan_approval', 'planning/step-03-await-approval.md', extra);
  context.push(`.flow/${base}/implementation-plan.md`);
  const taskById = new Map(tasks.tasks.map((task) => [task.id, task]));
  const task =
    tasks.tasks.find((task) => task.state === 'in_progress') ??
    tasks.tasks
      .filter(
        (task) => task.state === 'pending' && task.depends_on.every((id) => taskById.get(id).state === 'completed')
      )
      .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))[0];
  if (task)
    return step('implementation', 'build/step-01-execute-task.md', {
      ...extra,
      task: qualifiedTaskId(item.id, task.id)
    });
  if (tasks.tasks.every((task) => task.state === 'completed'))
    return step('work_item_review', 'review/step-01-review-work-item.md', extra);
  return step('reconcile', 'reconcile/step-01-reconcile.md', extra);
}
export function runRoute({ args }) {
  const result = routeProject(projectRoot(args));
  info(
    args.includes('--json')
      ? JSON.stringify(result, null, 2)
      : `${result.action}: ${result.phase ?? result.reason}${result.work_item ? ` ${result.work_item}` : ''}`
  );
}
