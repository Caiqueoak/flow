import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stringify } from 'yaml';
import { ENGINEERING_HEADINGS } from '../src/artifacts/engineering.mjs';
import { PLAN_HEADINGS, documentRevision } from '../src/artifacts/implementation-plan.mjs';
import { defaultConfig, writeConfig } from '../src/shared/project-config.mjs';
import { generateGraphMarkdown } from '../src/commands/graph.mjs';
export function document(headings, metadata = {}) {
  return (
    '---\n' +
    stringify({ schema_version: 1, status: 'approved', approved_at: '2026-09-13T00:00:00Z', ...metadata }) +
    '---\n' +
    headings.map((h) => h + '\nConcrete project decision.').join('\n\n') +
    '\n'
  );
}
export const engineering = document(ENGINEERING_HEADINGS, {
  baseline: { profile: 'flow/readability-first@1', existing_code_policy: 'not_applicable' }
});
export const prd = document([
  '# Product Requirements',
  '## Purpose',
  '## Users',
  '## Scope',
  '## Requirements',
  '## Constraints',
  '## Non-goals'
]);
export const spec = [
  '## Status',
  '## Goal',
  '## Scope',
  '## Non-goals',
  '## Requirements',
  '## Acceptance criteria',
  '## Decisions'
]
  .map((h) => h + '\nBounded scope.')
  .join('\n');
export function item(id = 'W001', extra = {}) {
  return {
    id,
    folder: id + '-example',
    kind: 'feature',
    title: 'Example',
    state: 'pending',
    priority: 1,
    depends_on: [],
    blockers: [],
    ...extra
  };
}
export function task(id = 'T001', extra = {}) {
  return { id, title: 'Implement behavior', state: 'pending', depends_on: [], implementation: 'none', ...extra };
}
export function write(root, relative, content) {
  const file = path.join(root, '.flow', relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : stringify(content));
}
export function project(items = [item()]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-test-'));
  writeConfig(root, defaultConfig());
  write(root, 'docs/prd.md', prd);
  write(root, 'docs/engineering.md', engineering);
  backlog(root, items);
  write(root, 'gates.yaml', { schema_version: 1, gates: [] });
  return root;
}
export function backlog(root, items) {
  const value = stringify({ schema_version: 2, work_items: items });
  write(root, 'backlog.yaml', value);
  write(root, 'docs/graph.md', generateGraphMarkdown(value));
}
export function artifacts(root, work = item(), tasks = [task()]) {
  write(root, 'work-items/' + work.folder + '/spec.md', spec);
  write(root, 'work-items/' + work.folder + '/tasks.yaml', { schema_version: 1, work_item: work.id, tasks });
}
export function plan(root, work = item(), metadata = {}) {
  write(
    root,
    'work-items/' + work.folder + '/implementation-plan.md',
    document(PLAN_HEADINGS, {
      work_item: work.id,
      engineering_revision: documentRevision(engineering),
      spec_revision: documentRevision(spec),
      ...metadata
    })
  );
}
