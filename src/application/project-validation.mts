import path from 'node:path';
import { stringify, parseDocument } from 'yaml';
import { loadWorkItems } from '../infrastructure/persistence/work-items.mjs';
import { lifecycle } from '../domain/work-item/lifecycle.js';
import { derivedBacklog } from '../infrastructure/projections/backlog.js';
import { validateSpec } from '../domain/work-item/specification.mjs';
import { generateGraphMarkdown } from '../infrastructure/projections/graph.mjs';
import { fileExists, readText } from '../infrastructure/filesystem/index.js';
import { stagedFiles } from '../infrastructure/git/index.js';

export interface ValidationFinding {
  level: 'error';
  code: string;
  message: string;
}

export function validateProject(
  root: string,
  { preCommitTask = null, workItem = null }: { preCommitTask?: string | null; workItem?: string | null } = {}
): ValidationFinding[] {
  const findings: ValidationFinding[] = [],
    error = (code: string, message: string) => findings.push({ level: 'error', code, message });
  let items;
  try {
    items = loadWorkItems(root);
  } catch (e: unknown) {
    error('WORK_ITEMS', errorMessage(e));
    return findings;
  }
  const by = new Map(items.map((i) => [i.id, i]));
  for (const item of items) {
    if (workItem && item.id !== workItem) continue;
    const spec = validateSpec(readText(path.join(item.base, 'spec.md')), { expectedWorkItem: item.id });
    for (const message of spec.errors) error('SPEC', `${item.id}: ${message}`);
    if (item.maturity === 'outlined' && item.tasks.tasks.length)
      error('TASKS', `${item.id}: outlined work cannot have tasks.`);
    if (item.tasks.tasks.filter((t: { state: string }) => t.state === 'in_progress').length > 1)
      error('TASKS', `${item.id}: only one task can be in_progress.`);
    if (lifecycle(item, by).status === 'completed' && item.review.status !== 'approved')
      error('REVIEW', `${item.id}: completed work requires approved review.`);
  }
  if (preCommitTask) {
    try {
      const staged = stagedFiles(root);
      if (staged.some((file) => file.startsWith('_flow/generated/')))
        error('SCOPE', `${preCommitTask}: generated projections cannot be committed.`);
    } catch (e: unknown) {
      error('SCOPE', errorMessage(e));
    }
  }
  const generated = path.join(root, '_flow', 'generated'),
    expected = derivedBacklog(items),
    backlog = stringify(expected, { lineWidth: 0 }),
    graph = generateGraphMarkdown(expected);
  for (const [name, text] of [
    ['backlog.yaml', backlog],
    ['graph.md', graph]
  ] as const) {
    const f = path.join(generated, name);
    if (!fileExists(f)) error('PROJECTION_MISSING', `${name} is missing; run flow sync.`);
    else {
      const actual = readText(f);
      if (name.endsWith('.yaml') && parseDocument(actual, { prettyErrors: false }).errors.length)
        error('PROJECTION_INCONSISTENT', `${name} is malformed; run flow sync.`);
      else if (actual !== text) error('PROJECTION_STALE', `${name} differs from current canonical work-items.`);
    }
  }
  return findings;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
