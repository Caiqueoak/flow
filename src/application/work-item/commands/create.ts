import path from 'node:path';
import { stringify } from 'yaml';
import {
  FLOW_DIRECTORY,
  ID_PADDING,
  IMPLEMENTATION_PLAN_FILE,
  IMPLEMENTATION_PLAN_TITLE,
  REVIEW_FILE,
  SPEC_FILE,
  TASKS_FILE,
  WORK_ITEM_SPEC_TITLE,
  WORK_ITEMS_DIRECTORY
} from '../../../domain/project/project.js';
import {
  DEFAULT_WORK_ITEM_KIND,
  DEFAULT_WORK_ITEM_PRIORITY,
  WORK_ITEM_ID_PREFIX,
  type WorkItemId,
  type WorkItemKind
} from '../../../domain/work-item/work-item.js';
import { commaSeparatedValues, optionValue, requiredOption } from '../../command-runtime.js';
import { fail, recordOutput as writeOutput } from '../../command-runtime.js';
import { ensureDirectory, writeText, writeYaml } from '../../../infrastructure/filesystem/index.js';
import { loadProjectWorkItems } from '../work-item-context.js';

interface CreateWorkItemInput {
  id: WorkItemId;
  title: string;
  kind: WorkItemKind;
  priority: number;
  dependsOn: WorkItemId[];
}

export function createWorkItem(root: string, requestedId: string | undefined, args: readonly string[]): void {
  const items = loadProjectWorkItems(root);
  const title = requiredOption(args, '--title');
  const id = (requestedId as WorkItemId | undefined) ?? nextWorkItemId(items.map((item) => item.id));

  if (items.some((item) => item.id === id)) {
    fail(`${id} already exists.`);
  }

  const directory = path.join(root, FLOW_DIRECTORY, WORK_ITEMS_DIRECTORY, `${id}-${slugify(title)}`);
  ensureDirectory(directory);

  writeWorkItemShells(directory, {
    id,
    title,
    kind: (optionValue(args, '--kind') ?? DEFAULT_WORK_ITEM_KIND) as WorkItemKind,
    priority: Number(optionValue(args, '--priority') ?? DEFAULT_WORK_ITEM_PRIORITY),
    dependsOn: commaSeparatedValues(optionValue(args, '--depends-on')) as WorkItemId[]
  });

  writeOutput(`${id} created.`);
}

function writeWorkItemShells(directory: string, input: CreateWorkItemInput): void {
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

  writeText(path.join(directory, SPEC_FILE), `---\n${stringify(metadata).trimEnd()}\n---\n\n${WORK_ITEM_SPEC_TITLE}\n`);
  writeYaml(path.join(directory, TASKS_FILE), {
    schema_version: 3,
    work_item: input.id,
    tasks: []
  });
  writeText(
    path.join(directory, IMPLEMENTATION_PLAN_FILE),
    `---\nschema_version: 1\nwork_item: ${input.id}\nstatus: draft\n---\n\n${IMPLEMENTATION_PLAN_TITLE}\n`
  );
  writeYaml(path.join(directory, REVIEW_FILE), {
    schema_version: 1,
    work_item: input.id,
    status: 'pending'
  });
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
