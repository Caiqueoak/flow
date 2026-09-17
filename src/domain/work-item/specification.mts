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
import {
  WORK_ITEM_ID,
  type Blocker,
  type SpecMaturity,
  type WorkItemId,
  type WorkItemKind,
  type WorkItemSpecMetadata
} from './work-item.js';

export interface ParsedWorkItemSpecification {
  metadata: WorkItemSpecMetadata;
  body: string;
}

export function parseWorkItemSpec(
  text: string,
  { expectedWorkItem = null }: { expectedWorkItem?: string | null | undefined } = {}
): ParsedWorkItemSpecification {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new ArtifactValidationError('spec.md requires YAML frontmatter.');
  const doc = parseDocument(match[1] ?? '', { prettyErrors: false, uniqueKeys: true });
  if (doc.errors.length)
    throw new ArtifactValidationError(
      `spec.md frontmatter is invalid: ${doc.errors[0]?.message ?? 'unknown YAML error'}`
    );
  const value: unknown = doc.toJS();
  const m = isRecord(value) ? value : {};
  if (
    !m ||
    m.schema_version !== 1 ||
    typeof m.work_item !== 'string' ||
    !WORK_ITEM_ID.test(m.work_item) ||
    (expectedWorkItem && m.work_item !== expectedWorkItem)
  )
    throw new ArtifactValidationError('spec.md has invalid schema_version or work_item.');
  if (
    typeof m.title !== 'string' ||
    !m.title.trim() ||
    typeof m.kind !== 'string' ||
    !['feature', 'technical', 'maintenance'].includes(m.kind) ||
    typeof m.priority !== 'number' ||
    !Number.isInteger(m.priority) ||
    m.priority < 1 ||
    typeof m.maturity !== 'string' ||
    !['outlined', 'ready'].includes(m.maturity)
  )
    throw new ArtifactValidationError('spec.md has invalid canonical metadata.');
  for (const key of ['depends_on', 'blockers'])
    if (!Array.isArray(m[key])) throw new ArtifactValidationError(`spec.md ${key} must be a list.`);
  return {
    metadata: {
      schema_version: 1,
      work_item: m.work_item as WorkItemId,
      title: m.title,
      kind: m.kind as WorkItemKind,
      priority: m.priority as number,
      depends_on: m.depends_on as WorkItemId[],
      blockers: m.blockers as Blocker[],
      maturity: m.maturity as SpecMaturity
    },
    body: match[2] ?? ''
  };
}
export function validateSpec(text: string, options: { expectedWorkItem?: string | null | undefined } = {}) {
  const parsed = parseWorkItemSpec(text, options);
  if (parsed.metadata.maturity === 'outlined') return { valid: true, errors: [], ...parsed };
  const lines = new Set(parsed.body.split(/\r?\n/));
  const errors = SPEC_HEADINGS.filter((heading) => !lines.has(heading)).map((heading) => `Missing ${heading}.`);
  return { valid: errors.length === 0, errors, ...parsed };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
