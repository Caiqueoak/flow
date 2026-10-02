import path from 'node:path';
import { stringify } from 'yaml';
import {
  FLOW_DIRECTORY,
  ID_PADDING,
  REVIEW_FILE,
  SPEC_FILE,
  TASKS_FILE,
  WORK_ITEM_SPEC_TITLE,
  WORK_ITEMS_DIRECTORY
} from '../../../domain/project/project.js';
import { parseTasks } from '../../../domain/task/task-list.mjs';
import { parseReview } from '../../../domain/work-item/review.mjs';
import { parseWorkItemSpec } from '../../../domain/work-item/specification.mjs';
import {
  DEFAULT_WORK_ITEM_KIND,
  DEFAULT_WORK_ITEM_PRIORITY,
  WORK_ITEM_ID_PREFIX,
  type WorkItemId,
  type WorkItemKind
} from '../../../domain/work-item/work-item.js';
import { commaSeparatedValues, optionValue, requiredOption } from '../../command-runtime.js';
import { fail, recordOutput as writeOutput } from '../../command-runtime.js';
import {
  createTemporarySiblingDirectory,
  publishDirectory,
  readText,
  removeDirectory,
  writeText,
  writeYaml
} from '../../../infrastructure/filesystem/index.js';
import { parseCheckpoint } from '../../../domain/workflow/checkpoint.mjs';
import { loadExecutionState, writeExecutionState } from '../../../infrastructure/persistence/execution-state.mjs';
import { loadProjectWorkItems } from '../work-item-context.js';

interface CreateWorkItemInput {
  id: WorkItemId;
  title: string;
  outcome: string;
  kind: WorkItemKind;
  priority: number;
  dependsOn: WorkItemId[];
}

export function createWorkItem(root: string, requestedId: string | undefined, args: readonly string[]): void {
  const items = loadProjectWorkItems(root);
  const title = requiredOption(args, '--title');
  const outcome = requiredOption(args, '--outcome');
  const id = (requestedId as WorkItemId | undefined) ?? nextWorkItemId(items.map((item) => item.id));

  if (items.some((item) => item.id === id)) {
    fail(`${id} already exists.`);
  }

  const directory = path.join(root, FLOW_DIRECTORY, WORK_ITEMS_DIRECTORY, `${id}-${slugify(title)}`);
  const staging = createTemporarySiblingDirectory(directory);
  try {
    writeWorkItemShells(staging, {
      id,
      title,
      outcome,
      kind: (optionValue(args, '--kind') ?? DEFAULT_WORK_ITEM_KIND) as WorkItemKind,
      priority: Number(optionValue(args, '--priority') ?? DEFAULT_WORK_ITEM_PRIORITY),
      dependsOn: commaSeparatedValues(optionValue(args, '--depends-on')) as WorkItemId[]
    });
    validateWorkItemShell(staging, id);
    ensurePlanningCheckpointBeforeFirstWorkItem(root, items.length);
    publishDirectory(staging, directory);
  } finally {
    removeDirectory(staging);
  }

  writeOutput(`${id} created.`);
}

function ensurePlanningCheckpointBeforeFirstWorkItem(root: string, existingWorkItemCount: number): void {
  if (existingWorkItemCount > 0) return;

  const state = loadExecutionState(root);
  const current = state.checkpoint;
  if (current) {
    if (
      current.phase === 'planning' &&
      current.target.kind === 'work_item_map' &&
      current.target.ref === '_flow/work-items'
    ) {
      return;
    }
    fail('Cannot create the first work item while another checkpoint is active.');
  }

  state.checkpoint = parseCheckpoint({
    phase: 'planning',
    step: 'map_work_items',
    target: { kind: 'work_item_map', ref: '_flow/work-items', revision: null },
    status: 'active',
    inputs: [],
    dimensions: [],
    assumptions: [],
    latest_authorized_direction: null,
    next_frontier: [],
    updated_at: new Date().toISOString()
  });
  writeExecutionState(root, state);
}

function writeWorkItemShells(directory: string, input: CreateWorkItemInput): void {
  const metadata = {
    schema_version: 1,
    work_item: input.id,
    title: input.title,
    outcome: input.outcome,
    kind: input.kind,
    priority: input.priority,
    depends_on: input.dependsOn,
    blockers: [],
    maturity: 'outlined'
  };

  writeText(
    path.join(directory, SPEC_FILE),
    `---\n${stringify(metadata).trimEnd()}\n---\n\n${WORK_ITEM_SPEC_TITLE}\n\n## Outcome\n\n${input.outcome}\n`
  );
  writeYaml(path.join(directory, TASKS_FILE), {
    schema_version: 3,
    work_item: input.id,
    tasks: []
  });
  writeYaml(path.join(directory, REVIEW_FILE), {
    schema_version: 1,
    work_item: input.id,
    status: 'pending'
  });
}

function validateWorkItemShell(directory: string, id: WorkItemId): void {
  parseWorkItemSpec(readText(path.join(directory, SPEC_FILE)), { expectedWorkItem: id });
  parseTasks(readText(path.join(directory, TASKS_FILE)), { expectedWorkItem: id });
  parseReview(readText(path.join(directory, REVIEW_FILE)), { expectedWorkItem: id });
}

function nextWorkItemId(ids: readonly WorkItemId[]): WorkItemId {
  const highestId = ids.reduce((highest, id) => Math.max(highest, Number(id.slice(1))), 0);
  return `${WORK_ITEM_ID_PREFIX}${String(highestId + 1).padStart(ID_PADDING, '0')}` as WorkItemId;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'work-item'
  );
}
