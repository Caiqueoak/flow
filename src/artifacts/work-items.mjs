import fs from 'node:fs';
import path from 'node:path';
import { parseWorkItemSpec } from './spec.mjs';
import { parseTasks } from './tasks.mjs';
import { parseReview } from './review.mjs';
import { validateAcyclic, ArtifactValidationError, topologicalOrder } from './backlog.mjs';

const folderPattern = /^(W\d{3,})-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const read = (file) => fs.readFileSync(file, 'utf8');
export function workItemsDirectory(root) {
  return path.join(root, '_flow', 'work-items');
}
export function loadWorkItems(root) {
  const dir = workItemsDirectory(root);
  if (!fs.existsSync(dir)) return [];
  const items = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((entry) => {
      const match = entry.name.match(folderPattern);
      if (!match) throw new ArtifactValidationError(`Invalid work-item folder '${entry.name}'.`);
      const base = path.join(dir, entry.name);
      const id = match[1];
      for (const name of ['spec.md', 'tasks.yaml', 'implementation-plan.md', 'review.yaml'])
        if (!fs.existsSync(path.join(base, name))) throw new ArtifactValidationError(`${id} is missing ${name}.`);
      const spec = parseWorkItemSpec(read(path.join(base, 'spec.md')), { expectedWorkItem: id });
      const tasks = parseTasks(read(path.join(base, 'tasks.yaml')), { expectedWorkItem: id });
      const review = parseReview(read(path.join(base, 'review.yaml')), { expectedWorkItem: id });
      return { id, folder: entry.name, ...spec.metadata, specBody: spec.body, tasks, review, base };
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
export function lifecycle(item, byId) {
  if (item.maturity === 'outlined') return { status: 'outlined', reasons: [] };
  const incomplete = item.depends_on.filter((id) => lifecycle(byId.get(id), byId).status !== 'completed');
  const blockers = item.blockers.filter((b) => b.status === 'unresolved');
  if (incomplete.length || blockers.length)
    return {
      status: 'blocked',
      reasons: [
        ...incomplete.map((ref) => ({ type: 'dependency', ref })),
        ...blockers.map((b) => ({ type: 'blocker', ref: b.id }))
      ]
    };
  if (item.tasks.tasks.some((t) => t.state === 'in_progress')) return { status: 'in_progress', reasons: [] };
  if (item.tasks.tasks.length && item.tasks.tasks.every((t) => t.state === 'completed'))
    return { status: item.review.status === 'approved' ? 'completed' : 'review', reasons: [] };
  return { status: 'eligible', reasons: [] };
}
export function derivedBacklog(items) {
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    schema_version: 4,
    work_items: topologicalOrder(items).map((i) => ({
      id: i.id,
      folder: i.folder,
      title: i.title,
      kind: i.kind,
      priority: i.priority,
      spec_maturity: i.maturity,
      depends_on: i.depends_on,
      blockers: i.blockers,
      state: lifecycle(i, byId).status
    }))
  };
}
