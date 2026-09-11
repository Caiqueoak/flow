import fs from 'node:fs';
import path from 'node:path';
import { info } from '../shared/cli-io.mjs';
import { projectRoot } from '../shared/project-path.mjs';
import { parseBacklog, deriveExecutionStatus } from '../artifacts/backlog.mjs';
import { parseTasks, qualifiedTaskId } from '../artifacts/tasks.mjs';
import { validateEngineeringDocument } from '../artifacts/engineering.mjs';
import { parseState } from '../artifacts/state.mjs';

function result(value, json) {
  info(json ? JSON.stringify(value, null, 2) : `${value.action}: ${value.phase ?? value.reason}${value.work_item ? ` ${value.work_item}` : ''}${value.task ? ` ${value.task}` : ''}`);
}

export function routeProject(root) {
  const flowDir = path.join(root, '.flow');
  if (!fs.existsSync(path.join(flowDir, 'config.yaml'))) return { action: 'stop', reason: 'unrecoverable_blocker', details: 'Flow is not initialized. Run flow init first.' };
  const statePath = path.join(flowDir, 'state.yaml');
  const state = fs.existsSync(statePath) ? parseState(fs.readFileSync(statePath, 'utf8')) : null;
  if (state?.stop_reason) return { action: 'stop', reason: state.stop_reason, phase: state.execution.phase, step: state.execution.step };
  const engineeringPath = path.join(flowDir, 'docs', 'engineering.md');
  if (!fs.existsSync(engineeringPath)) {
    const step = state?.execution?.phase === 'engineering_bootstrap' ? state.execution.step ?? 'inspect' : 'inspect';
    const files = { inspect: 'engineering/step-01-inspect.md', synthesize: 'engineering/step-02-synthesize.md', enforcement: 'engineering/step-03-enforcement.md', review: 'engineering/step-04-review.md', present: 'engineering/step-05-present.md' };
    return { action: 'continue', phase: 'engineering_bootstrap', step, instruction: files[step] ?? files.inspect };
  }
  const engineering = validateEngineeringDocument(fs.readFileSync(engineeringPath, 'utf8'));
  if (engineering.status !== 'approved' || engineering.errors.length) {
    const step = state?.execution?.phase === 'engineering_bootstrap' ? state.execution.step ?? 'synthesize' : 'synthesize';
    const files = { inspect: 'engineering/step-01-inspect.md', synthesize: 'engineering/step-02-synthesize.md', enforcement: 'engineering/step-03-enforcement.md', review: 'engineering/step-04-review.md', present: 'engineering/step-05-present.md' };
    return { action: 'continue', phase: 'engineering_bootstrap', step, instruction: files[step] ?? files.synthesize };
  }

  const backlogPath = path.join(flowDir, 'backlog.yaml');
  if (!fs.existsSync(backlogPath)) return { action: 'continue', phase: 'discovery', step: 'define_project', instruction: 'discovery/step-01-project.md' };
  const backlog = parseBacklog(fs.readFileSync(backlogPath, 'utf8'));
  const byId = new Map(backlog.work_items.map((item) => [item.id, item]));
  const active = backlog.work_items.find((item) => item.state === 'in_progress');
  const candidates = active ? [active] : backlog.work_items.filter((item) => deriveExecutionStatus(item, byId).status === 'ready').sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  if (!candidates.length) {
    if (backlog.work_items.every((item) => item.state === 'completed')) return { action: 'stop', reason: 'finished' };
    return { action: 'stop', reason: 'external_action', details: 'No ready work item. Inspect dependency/external blockers.' };
  }
  const item = candidates[0];
  const folder = path.join(flowDir, 'work-items', item.folder);
  const spec = path.join(folder, 'spec.md');
  const tasksFile = path.join(folder, 'tasks.yaml');
  if (!fs.existsSync(spec) || !fs.existsSync(tasksFile)) return { action: 'continue', phase: 'planning', step: 'plan_work_item', work_item: item.id, instruction: 'planning/step-01-plan-work-item.md' };
  const tasks = parseTasks(fs.readFileSync(tasksFile, 'utf8'), { expectedWorkItem: item.id });
  const taskById = new Map(tasks.tasks.map((task) => [task.id, task]));
  const activeTask = tasks.tasks.find((task) => task.state === 'in_progress');
  const readyTasks = tasks.tasks.filter((task) => task.state === 'pending' && task.depends_on.every((id) => taskById.get(id).state === 'completed'));
  const task = activeTask ?? readyTasks[0];
  if (task) return { action: 'continue', phase: 'build', step: 'execute_task', work_item: item.id, task: qualifiedTaskId(item.id, task.id), instruction: 'build/step-01-execute-task.md' };
  if (tasks.tasks.every((task) => task.state === 'completed') && item.state !== 'completed') return { action: 'continue', phase: 'review', step: 'review_work_item', work_item: item.id, instruction: 'review/step-01-review-work-item.md' };
  return { action: 'continue', phase: 'reconcile', step: 'reconcile', work_item: item.id, instruction: 'reconcile/step-01-reconcile.md' };
}

export function runRoute({ args }) {
  result(routeProject(projectRoot(args)), args.includes('--json'));
}
