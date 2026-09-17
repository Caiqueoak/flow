import fs from 'node:fs';
import path from 'node:path';
import { parseWorkItemSpec } from '../../domain/work-item/specification.mjs';
import { parseTasks } from '../../domain/task/task-list.mjs';
import { parseReview } from '../../domain/work-item/review.mjs';
import { validateAcyclic, ArtifactValidationError } from '../../domain/work-item/backlog.mjs';
import type { LoadedWorkItem, WorkItemId } from '../../domain/work-item/work-item.js';

const folderPattern = /^(W\d{3,})-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const read = (file: string) => fs.readFileSync(file, 'utf8');
export function workItemsDirectory(root: string): string {
  return path.join(root, '_flow', 'work-items');
}
export function loadWorkItems(root: string): LoadedWorkItem[] {
  const dir = workItemsDirectory(root);
  if (!fs.existsSync(dir)) return [];
  const items = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((entry): LoadedWorkItem => {
      const match = entry.name.match(folderPattern);
      if (!match) throw new ArtifactValidationError(`Invalid work-item folder '${entry.name}'.`);
      const base = path.join(dir, entry.name);
      const id = match[1] as WorkItemId;
      for (const name of ['spec.md', 'tasks.yaml', 'implementation-plan.md', 'review.yaml'])
        if (!fs.existsSync(path.join(base, name))) throw new ArtifactValidationError(`${id} is missing ${name}.`);
      const spec = parseWorkItemSpec(read(path.join(base, 'spec.md')), { expectedWorkItem: id });
      const tasks = parseTasks(read(path.join(base, 'tasks.yaml')), { expectedWorkItem: id });
      const review = parseReview(read(path.join(base, 'review.yaml')), { expectedWorkItem: id });
      return { ...spec.metadata, id, folder: entry.name, specBody: spec.body, tasks, review, base };
    })
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const ids = new Set(items.map((i) => i.id));
  for (const item of items)
    for (const dep of item.depends_on) {
      if (!ids.has(dep)) throw new ArtifactValidationError(`${item.id} depends on unknown work item '${dep}'.`);
      if (dep === item.id) throw new ArtifactValidationError(`${item.id} cannot depend on itself.`);
    }
  validateAcyclic(items);
  return items;
}
