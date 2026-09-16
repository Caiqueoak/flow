// @ts-nocheck
export const SPEC_HEADINGS = Object.freeze([
  '# Work Item Specification',
  '## Problem',
  '## Scope',
  '## Non-goals',
  '## Requirements',
  '## Acceptance criteria',
  '## Contracts',
  '## Data and APIs',
  '## Edge cases',
  '## Risks',
  '## Decisions',
  '## Gates'
]);

import { parseDocument } from 'yaml';
import { ArtifactValidationError } from './backlog.mjs';
import { WORK_ITEM_ID } from '../contracts/contracts.js';
export function parseWorkItemSpec(text, { expectedWorkItem = null } = {}) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new ArtifactValidationError('spec.md requires YAML frontmatter.');
  const doc = parseDocument(match[1], { prettyErrors: false, uniqueKeys: true });
  if (doc.errors.length) throw new ArtifactValidationError(`spec.md frontmatter is invalid: ${doc.errors[0].message}`);
  const m = doc.toJS();
  if (
    !m ||
    m.schema_version !== 1 ||
    !WORK_ITEM_ID.test(m.work_item ?? '') ||
    (expectedWorkItem && m.work_item !== expectedWorkItem)
  )
    throw new ArtifactValidationError('spec.md has invalid schema_version or work_item.');
  if (
    !m.title?.trim() ||
    !['feature', 'technical', 'maintenance'].includes(m.kind) ||
    !Number.isInteger(m.priority) ||
    m.priority < 1 ||
    !['outlined', 'ready'].includes(m.maturity)
  )
    throw new ArtifactValidationError('spec.md has invalid canonical metadata.');
  for (const key of ['depends_on', 'blockers'])
    if (!Array.isArray(m[key])) throw new ArtifactValidationError(`spec.md ${key} must be a list.`);
  return { metadata: m, body: match[2] };
}
export function validateSpec(text, options = {}) {
  const parsed = parseWorkItemSpec(text, options);
  if (parsed.metadata.maturity === 'outlined') return { valid: true, errors: [], ...parsed };
  const lines = new Set(parsed.body.split(/\r?\n/));
  const errors = SPEC_HEADINGS.filter((heading) => !lines.has(heading)).map((heading) => `Missing ${heading}.`);
  return { valid: errors.length === 0, errors, ...parsed };
}
