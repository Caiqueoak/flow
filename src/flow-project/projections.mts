// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { stringify } from 'yaml';
import { loadWorkItems, derivedBacklog } from './work-items.mjs';
import { generateGraphMarkdown } from '../artifacts/backlog-graph.mjs';
const atomic = (file, text) => {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, text);
  fs.renameSync(temp, file);
};
export function syncProject(root) {
  // Intentionally only reads canonical work-items; this command never changes them.
  const backlog = derivedBacklog(loadWorkItems(root));
  const dir = path.join(root, '_flow', 'generated');
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(path.join(dir, '.gitignore'))) fs.writeFileSync(path.join(dir, '.gitignore'), '*\n!.gitignore\n');
  const text = stringify(backlog, { lineWidth: 0 });
  atomic(path.join(dir, 'backlog.yaml'), text);
  atomic(path.join(dir, 'graph.md'), generateGraphMarkdown(backlog));
  return backlog;
}
