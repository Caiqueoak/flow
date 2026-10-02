import { stringify } from 'yaml';
import { ID_PADDING, WORK_ITEM_SPEC_TITLE } from '../../../domain/project/project.js';
import {
  DEFAULT_WORK_ITEM_KIND,
  DEFAULT_WORK_ITEM_PRIORITY,
  WORK_ITEM_ID_PREFIX,
  type WorkItemId,
  type WorkItemKind,
  type WorkItemSpecMetadata
} from '../../../domain/work-item/work-item.js';
import { serializeWorkItemSpec } from '../../../domain/work-item/specification.mjs';
import { stringifyReview } from '../../../domain/work-item/review.mjs';
import { commaSeparatedValues, optionValue, requiredOption } from '../../command-runtime.js';
import { fail, recordOutput as writeOutput } from '../../command-runtime.js';
import { createWorkItemShell } from '../../../infrastructure/persistence/work-items.mjs';
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

  const folder = `${id}-${slugify(title)}`;
  createWorkItemShell(
    root,
    folder,
    id,
    buildWorkItemShell({
      id,
      title,
      outcome,
      kind: (optionValue(args, '--kind') ?? DEFAULT_WORK_ITEM_KIND) as WorkItemKind,
      priority: Number(optionValue(args, '--priority') ?? DEFAULT_WORK_ITEM_PRIORITY),
      dependsOn: commaSeparatedValues(optionValue(args, '--depends-on')) as WorkItemId[]
    })
  );

  writeOutput(`${id} created.`);
}

function buildWorkItemShell(input: CreateWorkItemInput) {
  const metadata: WorkItemSpecMetadata = {
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
  const body = `\n${WORK_ITEM_SPEC_TITLE}\n\n## Outcome\n\n${input.outcome}\n`;

  return {
    spec: serializeWorkItemSpec(metadata, body),
    tasks: stringify(
      {
        schema_version: 3,
        work_item: input.id,
        tasks: []
      },
      { lineWidth: 0 }
    ),
    review: stringifyReview({
      schema_version: 1,
      work_item: input.id,
      status: 'pending'
    })
  };
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
