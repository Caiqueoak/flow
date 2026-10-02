import fs from 'node:fs';
import path from 'node:path';
import { parseWorkItemSpec } from '../../domain/work-item/specification.mjs';
import { parseTasks } from '../../domain/task/task-list.mjs';
import { parseReview } from '../../domain/work-item/review.mjs';
import { validateAcyclic, ArtifactValidationError } from '../../domain/work-item/backlog.mjs';
import type { LoadedWorkItem, WorkItemId } from '../../domain/work-item/work-item.js';
import { atomicWriteText } from '../filesystem/files.js';

const folderPattern = /^(W\d{3,})-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const stagingPrefix = '.flow-work-item-';
const read = (file: string) => fs.readFileSync(file, 'utf8');

export interface WorkItemShell {
  spec: string;
  tasks: string;
  review: string;
}

export interface CreateWorkItemShellOptions {
  publish?: (stagingDirectory: string, finalDirectory: string) => void;
}

export function workItemsDirectory(root: string): string {
  return path.join(root, '_flow', 'work-items');
}

export function createWorkItemShell(
  root: string,
  folder: string,
  expectedWorkItem: WorkItemId,
  shell: WorkItemShell,
  { publish = fs.renameSync }: CreateWorkItemShellOptions = {}
): string {
  const match = folder.match(folderPattern);
  if (!match || match[1] !== expectedWorkItem)
    throw new ArtifactValidationError(`Invalid work-item folder '${folder}' for ${expectedWorkItem}.`);

  const parent = workItemsDirectory(root);
  fs.mkdirSync(parent, { recursive: true });
  const finalDirectory = path.join(parent, folder);
  if (fs.existsSync(finalDirectory)) throw new ArtifactValidationError(`${expectedWorkItem} already exists.`);

  const stagingDirectory = fs.mkdtempSync(path.join(parent, `${stagingPrefix}${folder}-`));
  try {
    atomicWriteText(path.join(stagingDirectory, 'spec.md'), shell.spec);
    atomicWriteText(path.join(stagingDirectory, 'tasks.yaml'), shell.tasks);
    atomicWriteText(path.join(stagingDirectory, 'review.yaml'), shell.review);
    validateWorkItemShell(stagingDirectory, expectedWorkItem);

    if (fs.existsSync(finalDirectory)) throw new ArtifactValidationError(`${expectedWorkItem} already exists.`);
    publish(stagingDirectory, finalDirectory);
    return finalDirectory;
  } finally {
    if (fs.existsSync(stagingDirectory)) fs.rmSync(stagingDirectory, { recursive: true, force: true });
  }
}

export function loadWorkItems(root: string): LoadedWorkItem[] {
  const dir = workItemsDirectory(root);
  if (!fs.existsSync(dir)) return [];
  const items = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(stagingPrefix))
    .map((entry): LoadedWorkItem => loadWorkItemDirectory(dir, entry.name))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const ids = new Set(items.map((item) => item.id));
  for (const item of items)
    for (const dependency of item.depends_on) {
      if (!ids.has(dependency))
        throw new ArtifactValidationError(`${item.id} depends on unknown work item '${dependency}'.`);
      if (dependency === item.id) throw new ArtifactValidationError(`${item.id} cannot depend on itself.`);
    }
  validateAcyclic(items);
  return items;
}

function loadWorkItemDirectory(parent: string, folder: string): LoadedWorkItem {
  const match = folder.match(folderPattern);
  if (!match) throw new ArtifactValidationError(`Invalid work-item folder '${folder}'.`);
  const base = path.join(parent, folder);
  const id = match[1] as WorkItemId;
  const shell = validateWorkItemShell(base, id);
  return { ...shell.spec.metadata, id, folder, specBody: shell.spec.body, tasks: shell.tasks, review: shell.review, base };
}

function validateWorkItemShell(directory: string, expectedWorkItem: WorkItemId) {
  for (const name of ['spec.md', 'tasks.yaml', 'review.yaml'])
    if (!fs.existsSync(path.join(directory, name)))
      throw new ArtifactValidationError(`${expectedWorkItem} is missing ${name}.`);

  return {
    spec: parseWorkItemSpec(read(path.join(directory, 'spec.md')), { expectedWorkItem }),
    tasks: parseTasks(read(path.join(directory, 'tasks.yaml')), { expectedWorkItem }),
    review: parseReview(read(path.join(directory, 'review.yaml')), { expectedWorkItem })
  };
}
