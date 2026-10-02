import path from 'node:path';
import { stringify } from 'yaml';
import { loadWorkItems } from '../persistence/work-items.mjs';
import { atomicWriteText, ensureDirectory, fileExists, writeText } from '../filesystem/index.js';
import { derivedBacklog, type DerivedBacklog } from './backlog.js';
import { generateGraphMarkdown } from './graph.mjs';

export function syncProject(root: string): DerivedBacklog {
  // Intentionally only reads canonical work-items; this command never changes them.
  const backlog = derivedBacklog(loadWorkItems(root));
  const dir = path.join(root, '_flow', 'generated');
  ensureDirectory(dir);
  if (!fileExists(path.join(dir, '.gitignore'))) writeText(path.join(dir, '.gitignore'), '*\n!.gitignore\n');
  const text = stringify(backlog, { lineWidth: 0 });
  atomicWriteText(path.join(dir, 'backlog.yaml'), text);
  atomicWriteText(path.join(dir, 'graph.md'), generateGraphMarkdown(backlog));
  return backlog;
}
