import path from 'node:path';
import { parse, stringify } from 'yaml';
import { fail, info } from '../shared/cli-io.mjs';
import { projectRoot } from '../shared/project-path.mjs';
import { loadWorkItems, lifecycle } from '../artifacts/work-items.mjs';
import { parseTasks } from '../artifacts/tasks.mjs';
import { parseReview } from '../artifacts/review.mjs';
import { validateSpec, SPEC_HEADINGS } from '../artifacts/spec.mjs';
import { validateProject } from './validate.mjs';
import { evaluateGates } from './gates.mjs';
import {
  DEFAULT_WORK_ITEM_KIND,
  DEFAULT_WORK_ITEM_PRIORITY,
  ID_PADDING,
  IMPLEMENTATION_PLAN_FILE,
  IMPLEMENTATION_PLAN_TITLE,
  REVIEW_FILE,
  SPEC_FILE,
  TASKS_FILE,
  WORK_ITEM_ID_PREFIX,
  WORK_ITEM_SPEC_TITLE
} from '../domain/constants.js';
import { isValidTaskCommitSubject } from '../domain/policies/task-commit.js';
import {
  commaSeparatedValues,
  optionValue,
  positionalArguments,
  projectRelativeFiles
} from '../application/shared/arguments.js';
import {
  implementationPlanRevision,
  isImplementationPlanApproved,
  parseImplementationPlan,
  serializeImplementationPlan
} from '../application/shared/implementation-plan.js';
import {
  ensureDirectory,
  projectRelativePath,
  readText,
  writeText,
  writeYaml
} from '../infrastructure/filesystem/files.js';
import {
  assertExactStagedFiles,
  assertOnlyStagedFiles,
  createCommit,
  resetFiles,
  stageFiles
} from '../infrastructure/git/git.js';
import { createTemporaryGitIndex, removeTemporaryGitIndex } from '../infrastructure/git/git-index.js';

export function runWorkItem({ args }) {
  const root = projectRoot(args);
  const [action, target] = positionalArguments(args);

  if (action === 'create') {
    return createWorkItem(root, target, args);
  }

  const item = findWorkItem(root, target);

  switch (action) {
    case 'promote':
      promoteWorkItem(item);
      break;
    case 'set':
      updateWorkItemIdentity(item, args);
      break;
    case 'priority':
      updateWorkItemPriority(item, args);
      break;
    case 'dependencies':
      updateWorkItemDependencies(item, args);
      break;
    case 'blocker-add':
      addWorkItemBlocker(item, args);
      break;
    case 'blocker-resolve':
      resolveWorkItemBlocker(item, args);
      break;
    case 'review-complete':
      return completeWorkItemReview(root, item, args);
    default:
      fail(`Unknown work-item operation '${action}'.`);
  }

  info(`${item.id} updated.`);
}

export function runTask({ args }) {
  const root = projectRoot(args);
  const [action, target] = positionalArguments(args);
  const item = findWorkItem(root, workItemIdFromTaskTarget(target));

  ensureWorkItemReady(item);

  const tasksFile = path.join(item.base, TASKS_FILE);
  const tasks = parseTasks(readText(tasksFile), { expectedWorkItem: item.id });

  if (action === 'create') {
    return createTask(item, tasksFile, tasks, args);
  }

  const task = findTask(tasks.tasks, target);

  switch (action) {
    case 'start':
      startTask(root, item, tasksFile, tasks, task, target);
      return info(`${target} started.`);
    case 'set':
      updateTask(tasksFile, tasks, task, target, args);
      return info(`${target} updated.`);
    case 'commit':
      return commitTask(root, item, tasksFile, tasks, task, target, args);
    default:
      fail(`Unknown task operation '${action}'.`);
  }
}

export function runScope({ args }) {
  const root = projectRoot(args);
  const taskId = positionalArguments(args)[1];
  const findings = validateProject(root, { preCommitTask: taskId, skipTrace: true });

  if (findings.length) {
    fail(findings.map((finding) => `${finding.code}: ${finding.message}`).join(' | '));
  }

  assertExactStagedFiles(root, projectRelativeFiles(root, args));
  info(`${taskId} staged scope is valid.`);
}

export function runApproval({ args }) {
  const root = projectRoot(args);
  const [action, target] = positionalArguments(args);

  if (action !== 'record' || !target) {
    fail('Usage: flow approval record <implementation-plan.md>.');
  }

  if (path.isAbsolute(target)) {
    fail('Approval path must be project-relative.');
  }

  const file = path.resolve(root, target);
  const item = loadWorkItems(root).find((candidate) => path.resolve(candidate.base, IMPLEMENTATION_PLAN_FILE) === file);

  if (!item) {
    fail('Approvals may only record a canonical work-item implementation plan.');
  }

  const plan = parseImplementationPlan(readText(file));
  if (!plan) {
    fail('implementation-plan.md requires YAML frontmatter.');
  }

  const approvedAt = normalizedApprovalTimestamp(args);
  plan.metadata.status = 'approved';
  delete plan.metadata.approval;
  plan.metadata.approval = {
    at: approvedAt,
    revision: implementationPlanRevision(plan.metadata, plan.body)
  };

  writeText(file, serializeImplementationPlan(plan.metadata, plan.body));
  info(`${item.id} implementation plan approved.`);
}

function createWorkItem(root, requestedId, args) {
  const items = loadWorkItems(root);
  const title = optionValue(args, '--title');

  if (!title) {
    fail('--title is required.');
  }

  const id = requestedId ?? nextWorkItemId(items);
  if (items.some((item) => item.id === id)) {
    fail(`${id} already exists.`);
  }

  const base = path.join(root, '_flow', 'work-items', `${id}-${slugify(title)}`);
  ensureDirectory(base);

  writeWorkItemShells(base, {
    id,
    title,
    kind: optionValue(args, '--kind') ?? DEFAULT_WORK_ITEM_KIND,
    priority: Number(optionValue(args, '--priority') ?? DEFAULT_WORK_ITEM_PRIORITY),
    dependsOn: commaSeparatedValues(optionValue(args, '--depends-on'))
  });

  info(`${id} created.`);
}

function writeWorkItemShells(base, input) {
  const metadata = {
    schema_version: 1,
    work_item: input.id,
    title: input.title,
    kind: input.kind,
    priority: input.priority,
    depends_on: input.dependsOn,
    blockers: [],
    maturity: 'outlined'
  };

  writeText(path.join(base, SPEC_FILE), `---\n${stringify(metadata).trimEnd()}\n---\n\n${WORK_ITEM_SPEC_TITLE}\n`);
  writeYaml(path.join(base, TASKS_FILE), {
    schema_version: 3,
    work_item: input.id,
    tasks: []
  });
  writeText(
    path.join(base, IMPLEMENTATION_PLAN_FILE),
    `---\nschema_version: 1\nwork_item: ${input.id}\nstatus: draft\n---\n\n${IMPLEMENTATION_PLAN_TITLE}\n`
  );
  writeYaml(path.join(base, REVIEW_FILE), {
    schema_version: 1,
    work_item: input.id,
    status: 'pending'
  });
}

function promoteWorkItem(item) {
  const specFile = path.join(item.base, SPEC_FILE);
  const result = validateSpec(readText(specFile), { expectedWorkItem: item.id });
  const bodyHeadings = new Set(result.body.split(/\r?\n/));
  const missingHeadings = SPEC_HEADINGS.filter((heading) => !bodyHeadings.has(heading));
  const errors = [...result.errors, ...missingHeadings];

  if (errors.length) {
    fail(`${item.id} spec is insufficient: ${errors.join(', ')}`);
  }

  editSpecMetadata(item, (metadata) => {
    metadata.maturity = 'ready';
  });
}

function updateWorkItemIdentity(item, args) {
  const title = optionValue(args, '--title');
  const kind = optionValue(args, '--kind');

  editSpecMetadata(item, (metadata) => {
    if (title) metadata.title = title;
    if (kind) metadata.kind = kind;
  });
}

function updateWorkItemPriority(item, args) {
  editSpecMetadata(item, (metadata) => {
    metadata.priority = Number(optionValue(args, '--priority'));
  });
}

function updateWorkItemDependencies(item, args) {
  editSpecMetadata(item, (metadata) => {
    metadata.depends_on = commaSeparatedValues(optionValue(args, '--depends-on'));
  });
}

function addWorkItemBlocker(item, args) {
  editSpecMetadata(item, (metadata) => {
    metadata.blockers.push({
      id: optionValue(args, '--id'),
      type: optionValue(args, '--type'),
      description: optionValue(args, '--description'),
      status: 'unresolved'
    });
  });
}

function resolveWorkItemBlocker(item, args) {
  const blockerId = optionValue(args, '--id');

  editSpecMetadata(item, (metadata) => {
    const blocker = metadata.blockers.find((candidate) => candidate.id === blockerId);
    if (!blocker) fail('Unknown blocker.');
    blocker.status = 'resolved';
  });
}

function createTask(item, tasksFile, tasks, args) {
  const title = optionValue(args, '--title');
  if (!title) fail('--title is required.');

  const taskId = nextTaskId(tasks.tasks);
  tasks.tasks.push({
    id: taskId,
    title,
    state: 'pending',
    depends_on: commaSeparatedValues(optionValue(args, '--depends-on'))
  });

  writeYaml(tasksFile, tasks);
  info(`${item.id}-${taskId} created.`);
}

function startTask(root, item, tasksFile, tasks, task, target) {
  const allItems = loadWorkItems(root);
  const workItemsById = new Map(allItems.map((candidate) => [candidate.id, candidate]));

  if (lifecycle(item, workItemsById).status === 'blocked') {
    fail(`${item.id} is blocked.`);
  }

  if (tasks.tasks.some((candidate) => candidate.state === 'in_progress')) {
    fail('Another task is already in_progress.');
  }

  const dependenciesCompleted = task.depends_on.every(
    (dependencyId) => tasks.tasks.find((candidate) => candidate.id === dependencyId)?.state === 'completed'
  );

  if (!dependenciesCompleted) {
    fail(`${target} has incomplete dependencies.`);
  }

  ensureApprovedImplementationPlan(item);

  task.state = 'in_progress';
  writeYaml(tasksFile, tasks);
}

function updateTask(tasksFile, tasks, task, target, args) {
  if (task.state !== 'pending') {
    fail('Only pending tasks can be changed.');
  }

  const title = optionValue(args, '--title');
  const dependencies = optionValue(args, '--depends-on');

  if (title) task.title = title;
  if (dependencies !== undefined) task.depends_on = commaSeparatedValues(dependencies);

  writeYaml(tasksFile, tasks);
}

function commitTask(root, item, tasksFile, tasks, task, taskId, args) {
  if (task.state !== 'in_progress') {
    fail(`${taskId} must be in_progress.`);
  }

  const subject = optionValue(args, '--message')?.trim();
  if (!subject || !isValidTaskCommitSubject(subject, taskId)) {
    fail(`--message must be type(domain): description [${taskId}].`);
  }

  ensurePreCommitValidation(root, taskId);

  const files = projectRelativeFiles(root, args);
  assertExactStagedFiles(root, files);
  ensureTaskGatesPass(root, taskId);

  const originalTasks = readText(tasksFile);
  const temporaryIndex = createTemporaryGitIndex(root);
  const taskFile = projectRelativePath(root, tasksFile);

  task.state = 'completed';
  writeYaml(tasksFile, tasks);

  try {
    stageFiles(root, [taskFile], temporaryIndex.env);
    assertExactStagedFiles(root, [...files, taskFile], temporaryIndex.env);
    createCommit({
      root,
      subject,
      body: `Flow-Work-Item: ${item.id}\nFlow-Task: ${taskId}`,
      env: temporaryIndex.env
    });
    resetFiles(root, [...files, taskFile]);
  } catch (error) {
    writeText(tasksFile, originalTasks);
    throw error;
  } finally {
    removeTemporaryGitIndex(temporaryIndex);
  }

  info(`${taskId} committed.`);
}

function completeWorkItemReview(root, item, args) {
  const domain = optionValue(args, '--domain');
  if (!domain) fail('--domain is required.');

  ensureReviewCanComplete(item);
  ensureApprovedImplementationPlan(item);
  ensureReviewValidationPasses(root, item.id);
  ensureReviewGatesPass(root, item.id);

  const reviewFilePath = path.join(item.base, REVIEW_FILE);
  const review = parseReview(readText(reviewFilePath), { expectedWorkItem: item.id });
  const workItemPath = projectRelativePath(root, item.base);
  const reviewFile = `${workItemPath}/${REVIEW_FILE}`;
  const specFile = `${workItemPath}/${SPEC_FILE}`;
  const allowedFiles = [specFile, reviewFile];

  assertOnlyStagedFiles(root, allowedFiles);

  const temporaryIndex = createTemporaryGitIndex(root);

  try {
    review.status = 'approved';
    review.reviewed_at = new Date().toISOString();
    writeYaml(reviewFilePath, review);
    stageFiles(root, [reviewFile], temporaryIndex.env);
    createCommit({
      root,
      subject: `chore(${domain}): complete review [${item.id}]`,
      env: temporaryIndex.env
    });
    resetFiles(root, allowedFiles);
  } catch (error) {
    review.status = 'pending';
    delete review.reviewed_at;
    writeYaml(reviewFilePath, review);
    throw error;
  } finally {
    removeTemporaryGitIndex(temporaryIndex);
  }

  info(`${item.id} review completed.`);
}

function ensurePreCommitValidation(root, taskId) {
  const findings = validateProject(root, { preCommitTask: taskId, skipTrace: true });
  if (findings.length) {
    fail(`Pre-commit validation failed: ${findings.map((finding) => finding.code).join(', ')}.`);
  }
}

function ensureTaskGatesPass(root, taskId) {
  const failedGates = evaluateGates(root, { task: taskId }).filter((gate) => gate.blocking && gate.status !== 'passed');

  if (failedGates.length) {
    fail(`Task gates failed: ${failedGates.map((gate) => gate.id).join(', ')}.`);
  }
}

function ensureReviewValidationPasses(root, workItemId) {
  const findings = validateProject(root, { workItem: workItemId });
  if (findings.length) {
    fail(`Review validation failed: ${findings.map((finding) => finding.code).join(', ')}.`);
  }
}

function ensureReviewGatesPass(root, workItemId) {
  const failedGates = evaluateGates(root, {
    workItem: workItemId,
    stage: 'work-item-review'
  }).filter((gate) => gate.blocking && gate.status !== 'passed');

  if (failedGates.length) {
    fail(`Review gates failed: ${failedGates.map((gate) => gate.id).join(', ')}.`);
  }
}

function ensureReviewCanComplete(item) {
  const hasTasks = item.tasks.tasks.length > 0;
  const allTasksCompleted = item.tasks.tasks.every((task) => task.state === 'completed');

  if (item.maturity !== 'ready' || !hasTasks || !allTasksCompleted) {
    fail(`${item.id} is not ready for review completion.`);
  }
}

function ensureApprovedImplementationPlan(item) {
  const planFile = path.join(item.base, IMPLEMENTATION_PLAN_FILE);
  if (!isImplementationPlanApproved(readText(planFile))) {
    fail(`${item.id} requires an approved implementation plan.`);
  }
}

function ensureWorkItemReady(item) {
  if (item.maturity !== 'ready') {
    fail(`${item.id} is outlined; promote its complete spec first.`);
  }
}

function findWorkItem(root, id) {
  const item = loadWorkItems(root).find((candidate) => candidate.id === id);
  if (!item) fail(`Unknown work-item '${id}'.`);
  return item;
}

function findTask(tasks, target) {
  const localTaskId = target?.match(/T\d{3,}$/)?.[0];
  const task = tasks.find((candidate) => candidate.id === localTaskId);
  if (!task) fail(`Unknown task '${target}'.`);
  return task;
}

function editSpecMetadata(item, mutate) {
  const specFile = path.join(item.base, SPEC_FILE);
  const text = readText(specFile);
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (!match) {
    fail(`${item.id} spec requires YAML frontmatter.`);
  }

  const metadata = parse(match[1]);
  mutate(metadata);

  writeText(specFile, `---\n${stringify(metadata).trimEnd()}\n---${text.slice(match[0].length)}`);
}

function nextWorkItemId(items) {
  const highestId = items.reduce((highest, item) => Math.max(highest, Number(item.id.slice(1))), 0);

  return `${WORK_ITEM_ID_PREFIX}${String(highestId + 1).padStart(ID_PADDING, '0')}`;
}

function nextTaskId(tasks) {
  const highestId = tasks.reduce((highest, task) => Math.max(highest, Number(task.id.slice(1))), 0);

  return `T${String(highestId + 1).padStart(ID_PADDING, '0')}`;
}

function workItemIdFromTaskTarget(target) {
  return (target ?? '').split('-T')[0];
}

function normalizedApprovalTimestamp(args) {
  const value = optionValue(args, '--at') ?? new Date().toISOString();

  if (Number.isNaN(Date.parse(value))) {
    fail('--at must be an ISO timestamp.');
  }

  return new Date(value).toISOString();
}

function slugify(value) {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'work-item'
  );
}
