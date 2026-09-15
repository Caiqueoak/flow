import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import { fail, info } from '../shared/cli-io.mjs';
import { projectRoot, valueAfter } from '../shared/project-path.mjs';
import { parseBacklog, deriveExecutionStatus } from '../artifacts/backlog.mjs';
import { parseTasks } from '../artifacts/tasks.mjs';
import { emptyState, parseState, stringifyState } from '../artifacts/state.mjs';
import { generateGraphMarkdown } from './graph.mjs';
import { traceTask } from './trace.mjs';
import { SPEC_HEADINGS } from '../artifacts/spec.mjs';
import { validateImplementationPlan } from '../artifacts/implementation-plan.mjs';
import { BACKLOG_SCHEMA_VERSION, TASKS_SCHEMA_VERSION } from '../domain/contracts.mjs';
import { validateProject } from './validate.mjs';
import { evaluateGates } from './gates.mjs';

const positional = (args) =>
  args.filter((value, index) => !value.startsWith('-') && (index === 0 || !args[index - 1].startsWith('--')));
const list = (value) =>
  value
    ? value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
const slug = (title) =>
  title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'work-item';
const cleanTask = (task) => {
  const clean = { ...task };
  delete clean.implementation;
  delete clean.commit_sha;
  return clean;
};

function requireValue(args, name) {
  const value = valueAfter(args, name);
  if (!value) fail(`${name} is required.`);
  return value;
}
function flowPath(root, relative) {
  return path.join(root, '_flow', relative);
}
function readBacklog(root) {
  const file = flowPath(root, 'backlog.yaml');
  if (!fs.existsSync(file)) return { schema_version: BACKLOG_SCHEMA_VERSION, work_items: [] };
  return parseBacklog(fs.readFileSync(file, 'utf8'));
}
function writeBacklog(root, backlog) {
  const value = { schema_version: BACKLOG_SCHEMA_VERSION, work_items: backlog.work_items };
  const text = stringify(value, { lineWidth: 0 });
  parseBacklog(text);
  fs.mkdirSync(flowPath(root, 'docs'), { recursive: true });
  fs.writeFileSync(flowPath(root, 'backlog.yaml'), text);
  fs.writeFileSync(flowPath(root, 'docs/graph.md'), generateGraphMarkdown(text));
}
function findItem(backlog, id) {
  const item = backlog.work_items.find((candidate) => candidate.id === id);
  if (!item) fail(`Unknown work-item '${id}'.`);
  return item;
}
function taskFile(root, item) {
  return flowPath(root, `work-items/${item.folder}/tasks.yaml`);
}
function readTasks(root, item) {
  const file = taskFile(root, item);
  if (!fs.existsSync(file)) return { schema_version: TASKS_SCHEMA_VERSION, work_item: item.id, tasks: [] };
  return parseTasks(fs.readFileSync(file, 'utf8'), { expectedWorkItem: item.id });
}
function writeTasks(root, item, tasks) {
  const value = { schema_version: TASKS_SCHEMA_VERSION, work_item: item.id, tasks: tasks.tasks.map(cleanTask) };
  const text = stringify(value, { lineWidth: 0 });
  parseTasks(text, { expectedWorkItem: item.id });
  fs.mkdirSync(path.dirname(taskFile(root, item)), { recursive: true });
  fs.writeFileSync(taskFile(root, item), text);
}
function invalidatePlan(root, item) {
  const file = flowPath(root, `work-items/${item.folder}/implementation-plan.md`);
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return;
  const metadata = parse(match[1]);
  if (metadata.status !== 'approved') return;
  metadata.status = 'draft';
  delete metadata.approved_at;
  fs.writeFileSync(file, text.replace(match[0], `---\n${stringify(metadata).trimEnd()}\n---`));
}
function updateTaskCursor(root, item, task, completedAll) {
  const file = flowPath(root, 'state.yaml');
  const state = fs.existsSync(file) ? parseState(fs.readFileSync(file, 'utf8')) : emptyState();
  state.stop_reason = null;
  if (task.state === 'in_progress') {
    state.execution = { phase: 'implementation', step: 'execute_task' };
    state.active = { work_item: item.id, task: `${item.id}-${task.id}` };
  } else {
    state.execution = completedAll
      ? { phase: 'review', step: 'review_work_item' }
      : { phase: 'implementation', step: 'start_task' };
    state.active = { work_item: completedAll ? item.id : null, task: null };
  }
  fs.writeFileSync(file, stringifyState(state));
}

function transact(root, mutate) {
  const live = flowPath(root, '');
  if (!fs.existsSync(live)) fail('Flow is not initialized. Run flow init.');
  const staging = fs.mkdtempSync(path.join(root, '_flow-transaction-'));
  const stagedFlow = path.join(staging, '_flow');
  const backup = path.join(staging, 'backup');
  fs.cpSync(live, stagedFlow, { recursive: true });
  try {
    const result = mutate(staging);
    if (fs.existsSync(path.join(stagedFlow, 'backlog.yaml')))
      parseBacklog(fs.readFileSync(path.join(stagedFlow, 'backlog.yaml'), 'utf8'));
    fs.renameSync(live, backup);
    try {
      fs.renameSync(stagedFlow, live);
    } catch (error) {
      fs.renameSync(backup, live);
      throw error;
    }
    fs.rmSync(staging, { recursive: true, force: true });
    return result;
  } catch (error) {
    if (!fs.existsSync(live) && fs.existsSync(backup)) fs.renameSync(backup, live);
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function mutateWorkItem(root, operation) {
  const backlog = readBacklog(root);
  if (operation.action === 'create') {
    const numeric = backlog.work_items.reduce((max, item) => Math.max(max, Number(item.id.slice(1))), 0) + 1;
    const id = operation.work_item ?? `W${String(numeric).padStart(3, '0')}`;
    if (backlog.work_items.some((item) => item.id === id)) fail(`${id} already exists.`);
    const title = operation.title?.trim();
    if (!title) fail('--title is required.');
    backlog.work_items.push({
      id,
      folder: `${id}-${slug(title)}`,
      kind: operation.kind ?? 'feature',
      title,
      state: 'pending',
      priority: operation.priority ?? 1,
      spec_maturity: 'outlined',
      depends_on: operation.depends_on ?? [],
      blockers: [],
      objective: operation.objective ?? title,
      boundaries: operation.boundaries ?? [],
      requirements: operation.requirements ?? [],
      provides: operation.provides ?? [],
      consumes: operation.consumes ?? [],
      dependency_rationale: operation.dependency_rationale ?? {}
    });
    writeBacklog(root, backlog);
    return id;
  }
  const item = findItem(backlog, operation.work_item);
  if (item.state === 'completed' && operation.action !== 'review-complete')
    fail(`${item.id} is completed; preserve history and create maintenance work instead.`);
  if (operation.action === 'set') {
    if (operation.title) item.title = operation.title;
    if (operation.kind) item.kind = operation.kind;
    invalidatePlan(root, item);
  } else if (operation.action === 'priority') item.priority = operation.priority;
  else if (operation.action === 'dependencies') {
    item.depends_on = operation.depends_on ?? [];
    invalidatePlan(root, item);
  } else if (operation.action === 'blocker-add') {
    if (item.blockers.some((blocker) => blocker.id === operation.id)) fail(`Blocker '${operation.id}' already exists.`);
    item.blockers.push({
      id: operation.id,
      type: operation.type,
      description: operation.description,
      status: 'unresolved'
    });
  } else if (operation.action === 'blocker-resolve') {
    const blocker = item.blockers.find((candidate) => candidate.id === operation.id);
    if (!blocker) fail(`Unknown blocker '${operation.id}'.`);
    blocker.status = 'resolved';
  } else if (operation.action === 'review-complete') {
    const stateFile = flowPath(root, 'state.yaml');
    const state = fs.existsSync(stateFile) ? parseState(fs.readFileSync(stateFile, 'utf8')) : emptyState();
    const tasks = readTasks(root, item);
    if (!tasks.tasks.length || tasks.tasks.some((task) => task.state !== 'completed'))
      fail(`${item.id} has incomplete tasks.`);
    if (item.state !== 'in_progress') fail(`${item.id} must be in_progress before review completion.`);
    if (
      state.execution.phase !== 'review' ||
      state.execution.step !== 'review_work_item' ||
      state.active.work_item !== item.id
    )
      fail(`${item.id} must be at the review cursor before review completion.`);
    item.state = 'completed';
    state.active = { work_item: null, task: null };
    state.stop_reason = null;
    fs.writeFileSync(stateFile, stringifyState(state));
  } else if (operation.action === 'promote') {
    const spec = flowPath(root, `work-items/${item.folder}/spec.md`);
    if (!fs.existsSync(spec)) fail(`${item.id} requires spec.md before promotion.`);
    const lines = new Set(fs.readFileSync(spec, 'utf8').split(/\r?\n/));
    const missing = SPEC_HEADINGS.filter((heading) => !lines.has(heading));
    if (missing.length) fail(`${item.id} spec is insufficient: missing ${missing.join(', ')}.`);
    item.spec_maturity = 'ready';
  } else fail(`Unknown work-item operation '${operation.action}'.`);
  writeBacklog(root, backlog);
  return item.id;
}

function mutateTask(root, operation) {
  const backlog = readBacklog(root);
  const workId = operation.work_item ?? operation.task?.split('-T')[0];
  const item = findItem(backlog, workId);
  if (item.spec_maturity !== 'ready')
    fail(`${item.id} is outlined; promote its complete spec before creating or starting tasks.`);
  const tasks = readTasks(root, item);
  if (operation.action === 'create') {
    const numeric = tasks.tasks.reduce((max, task) => Math.max(max, Number(task.id.slice(1))), 0) + 1;
    const id = `T${String(numeric).padStart(3, '0')}`;
    if (!operation.title) fail('--title is required.');
    tasks.tasks.push({
      id,
      title: operation.title,
      state: 'pending',
      depends_on: operation.depends_on ?? [],
      traceability: operation.traceability ?? 'commit'
    });
    invalidatePlan(root, item);
    writeTasks(root, item, tasks);
    return `${item.id}-${id}`;
  }
  const localId = operation.task?.match(/(T\d{3,})$/)?.[1];
  const task = tasks.tasks.find((candidate) => candidate.id === localId);
  if (!task) fail(`Unknown task '${operation.task}'.`);
  const byId = new Map(backlog.work_items.map((candidate) => [candidate.id, candidate]));
  if (operation.action === 'set') {
    if (task.state !== 'pending') fail('Only pending tasks can be changed.');
    if (operation.title) task.title = operation.title;
    if (operation.depends_on) task.depends_on = operation.depends_on;
    if (operation.traceability) task.traceability = operation.traceability;
    invalidatePlan(root, item);
  } else if (operation.action === 'start') {
    if (deriveExecutionStatus(item, byId).status === 'blocked') fail(`${item.id} is blocked.`);
    if (tasks.tasks.some((candidate) => candidate.state === 'in_progress'))
      fail('Another task is already in_progress.');
    if (!task.depends_on.every((id) => tasks.tasks.find((candidate) => candidate.id === id)?.state === 'completed'))
      fail(`${operation.task} has incomplete dependencies.`);
    const planPath = flowPath(root, `work-items/${item.folder}/implementation-plan.md`);
    const specPath = flowPath(root, `work-items/${item.folder}/spec.md`);
    const engineeringPath = flowPath(root, 'docs/engineering.md');
    if (!fs.existsSync(planPath) || !fs.existsSync(specPath) || !fs.existsSync(engineeringPath))
      fail(`${item.id} requires an approved implementation plan and current contracts.`);
    const plan = validateImplementationPlan(fs.readFileSync(planPath, 'utf8'), {
      workItem: item.id,
      engineeringText: fs.readFileSync(engineeringPath, 'utf8'),
      specText: fs.readFileSync(specPath, 'utf8')
    });
    if (plan.errors.length || plan.status !== 'approved')
      fail(`${item.id} implementation plan is missing, stale or not approved.`);
    item.state = 'in_progress';
    task.state = 'in_progress';
  } else if (operation.action === 'complete') {
    if (task.state !== 'in_progress') fail(`${operation.task} must be in_progress before completion.`);
    if (task.traceability === 'commit') {
      const traced = traceTask(path.dirname(root), operation.task);
      if (traced.status !== 'resolved') fail(`${operation.task} requires exactly one reachable implementation commit.`);
    }
    task.state = 'completed';
    // Completion moves the cursor to review but never completes the work item.
  } else fail(`Unknown task operation '${operation.action}'.`);
  writeTasks(root, item, tasks);
  writeBacklog(root, backlog);
  if (['start', 'complete'].includes(operation.action))
    updateTaskCursor(
      root,
      item,
      task,
      tasks.tasks.every((candidate) => candidate.state === 'completed')
    );
  return operation.task;
}

function workItemFromArgs(args) {
  const values = positional(args);
  const action = values[0];
  const work_item = values[1];
  const priority = valueAfter(args, '--priority');
  const dependencies = valueAfter(args, '--depends-on');
  return {
    action,
    work_item,
    title: valueAfter(args, '--title'),
    kind: valueAfter(args, '--kind'),
    priority: priority ? Number(priority) : undefined,
    depends_on: dependencies === undefined ? undefined : list(dependencies),
    id: valueAfter(args, '--id'),
    type: valueAfter(args, '--type'),
    description: valueAfter(args, '--description')
  };
}
function taskFromArgs(args) {
  const values = positional(args);
  const target = values[1];
  const dependencies = valueAfter(args, '--depends-on');
  return {
    action: values[0],
    ...(target?.includes('-T') ? { task: target } : { work_item: target }),
    title: valueAfter(args, '--title'),
    depends_on: dependencies === undefined ? undefined : list(dependencies),
    traceability: valueAfter(args, '--traceability'),
    message: valueAfter(args, '--message')
  };
}

function createImplementationCommit(root, operation) {
  const backlog = readBacklog(root);
  const workId = operation.task?.split('-T')[0];
  const item = findItem(backlog, workId);
  const tasks = readTasks(root, item);
  const localId = operation.task?.match(/(T\d{3,})$/)?.[1];
  const task = tasks.tasks.find((candidate) => candidate.id === localId);
  if (!task || task.state !== 'in_progress' || task.traceability !== 'commit')
    fail(`${operation.task} must be an in_progress commit task.`);
  const existing = traceTask(root, operation.task);
  if (existing.status !== 'missing') fail(`${operation.task} already has reachable implementation evidence.`);
  const findings = validateProject(root, { preCommitTask: operation.task, skipTrace: true });
  if (findings.length)
    fail(
      `Pre-commit validation failed: ${findings.map((finding) => `${finding.code}: ${finding.message}`).join(' | ')}`
    );
  const gates = evaluateGates(root, { task: operation.task });
  const blocked = gates.filter((gate) => gate.blocking && gate.status !== 'passed');
  if (blocked.length) fail(`Task gates failed: ${blocked.map((gate) => gate.id).join(', ')}.`);
  let title = operation.message?.trim() || `${task.title} [${operation.task}]`;
  if (!title.includes(operation.task)) title += ` [${operation.task}]`;
  execFileSync('git', ['commit', '-m', title, '-m', `Flow-Work-Item: ${item.id}\nFlow-Task: ${operation.task}`], {
    cwd: root,
    stdio: 'inherit'
  });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

function commitFlowMetadata(root, qualifiedTask) {
  // The implementation commit must already have consumed its staged application
  // changes. Refuse to accidentally bundle a caller's staged work here.
  const alreadyStaged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
  if (alreadyStaged.length) fail(`Refusing metadata persistence with staged changes: ${alreadyStaged.join(', ')}.`);
  const taskFile = path.join('_flow', 'work-items');
  execFileSync('git', ['add', '--', '_flow/state.yaml', '_flow/backlog.yaml', '_flow/docs/graph.md', taskFile], {
    cwd: root
  });
  const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
  const allowed = new RegExp(`^_flow/(?:state\\.yaml|backlog\\.yaml|docs/graph\\.md|work-items/[^/]+/tasks\\.yaml)$`);
  if (staged.some((file) => !allowed.test(file.replace(/\\/g, '/'))))
    fail('Metadata persistence staged a non-Flow artifact.');
  if (!staged.length) return false;
  execFileSync('git', ['commit', '-m', `chore(flow): persist ${qualifiedTask} metadata`], {
    cwd: root,
    stdio: 'inherit'
  });
  return true;
}

export function runWorkItem({ args }) {
  const root = projectRoot(args);
  const result = transact(root, (staging) => mutateWorkItem(staging, workItemFromArgs(args)));
  info(`${result} updated.`);
}
export function runTask({ args }) {
  const root = projectRoot(args);
  const operation = taskFromArgs(args);
  if (operation.action === 'commit') {
    createImplementationCommit(root, operation);
    operation.action = 'complete';
  }
  const result = transact(root, (staging) => mutateTask(staging, operation));
  if (args[0] === 'commit' || args[0] === 'complete') commitFlowMetadata(root, operation.task);
  info(`${result} updated.`);
}
export function runState({ args }) {
  if (positional(args)[0] !== 'update') fail("flow state requires 'update'.");
  const root = projectRoot(args);
  transact(root, (staging) => {
    const file = flowPath(staging, 'state.yaml');
    const state = fs.existsSync(file) ? parseState(fs.readFileSync(file, 'utf8')) : emptyState();
    state.execution.phase = requireValue(args, '--phase');
    state.execution.step = requireValue(args, '--step');
    if (valueAfter(args, '--work-item'))
      state.active.work_item = valueAfter(args, '--work-item') === 'none' ? null : valueAfter(args, '--work-item');
    if (valueAfter(args, '--task'))
      state.active.task = valueAfter(args, '--task') === 'none' ? null : valueAfter(args, '--task');
    if (valueAfter(args, '--stop-reason'))
      state.stop_reason = valueAfter(args, '--stop-reason') === 'none' ? null : valueAfter(args, '--stop-reason');
    parseState(stringifyState(state));
    fs.writeFileSync(file, stringifyState(state));
  });
  info('Execution cursor updated.');
}
export function runScope({ args }) {
  const values = positional(args);
  if (values[0] !== 'validate' || !values[1]) fail('Usage: flow scope validate W###-T###.');
  const findings = validateProject(projectRoot(args), { preCommitTask: values[1], skipTrace: true });
  if (args.includes('--json')) info(JSON.stringify({ valid: findings.length === 0, findings }, null, 2));
  else if (!findings.length) info(`${values[1]} staged scope is valid.`);
  else fail(findings.map((finding) => `${finding.code}: ${finding.message}`).join(' | '));
  if (findings.length) process.exitCode = 1;
}
export function runApproval({ args }) {
  const values = positional(args);
  if (values[0] !== 'record' || !values[1]) fail('Usage: flow approval record <path>.');
  const root = projectRoot(args);
  transact(root, (staging) => {
    const relative = values[1].replace(/^_flow[\\/]/, '');
    const file = flowPath(staging, relative);
    if (!fs.existsSync(file)) fail(`Document '${values[1]}' does not exist.`);
    const text = fs.readFileSync(file, 'utf8');
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) fail('Document has no YAML frontmatter.');
    const metadata = parse(match[1]);
    metadata.status = 'approved';
    metadata.approved_at = valueAfter(args, '--at') ?? new Date().toISOString();
    if (Number.isNaN(Date.parse(metadata.approved_at))) fail('--at must be an ISO timestamp.');
    fs.writeFileSync(file, text.replace(match[0], `---\n${stringify(metadata).trimEnd()}\n---`));
  });
  info(`${values[1]} approved.`);
}
export function runBatch({ args }) {
  const root = projectRoot(args);
  const raw = args.includes('--stdin')
    ? fs.readFileSync(0, 'utf8')
    : fs.readFileSync(path.resolve(valueAfter(args, '--file')), 'utf8');
  const document = valueAfter(args, '--format') === 'json' ? JSON.parse(raw) : parse(raw);
  const operations = Array.isArray(document) ? document : document?.operations;
  if (!Array.isArray(operations) || !operations.length) fail('Batch input must contain a non-empty operations list.');
  transact(root, (staging) => {
    for (const operation of operations) {
      if (operation.entity === 'work_item') mutateWorkItem(staging, operation);
      else if (operation.entity === 'task') mutateTask(staging, operation);
      else fail(`Unknown batch entity '${operation.entity}'.`);
    }
  });
  info(`Applied ${operations.length} operation(s) atomically.`);
}
