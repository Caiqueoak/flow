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

import { createHash } from 'node:crypto';
import { parseDocument, stringify } from 'yaml';
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

export function serializeWorkItemSpec(metadata: WorkItemSpecMetadata, body: string): string {
  return `---\n${stringify(metadata).trimEnd()}\n---\n${body}`;
}

export function specificationRevision(metadata: WorkItemSpecMetadata, body: string): string {
  const stable = { ...metadata };
  delete stable.approval;
  return createHash('sha256').update(serializeWorkItemSpec(stable, body)).digest('hex');
}

export function isWorkItemSpecApproved(text: string, options: { expectedWorkItem?: string | null } = {}): boolean {
  try {
    const spec = parseWorkItemSpec(text, options);
    return spec.metadata.approval?.revision === specificationRevision(spec.metadata, spec.body);
  } catch {
    return false;
  }
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
  if (m.outcome !== undefined && (typeof m.outcome !== 'string' || !m.outcome.trim()))
    throw new ArtifactValidationError('spec.md outcome must be a non-empty string when present.');
  for (const key of ['depends_on', 'blockers'])
    if (!Array.isArray(m[key])) throw new ArtifactValidationError(`spec.md ${key} must be a list.`);
  return {
    metadata: {
      schema_version: 1,
      work_item: m.work_item as WorkItemId,
      title: m.title,
      ...(typeof m.outcome === 'string' && m.outcome.trim() ? { outcome: m.outcome.trim() } : {}),
      kind: m.kind as WorkItemKind,
      priority: m.priority as number,
      depends_on: m.depends_on as WorkItemId[],
      blockers: m.blockers as Blocker[],
      maturity: m.maturity as SpecMaturity,
      ...(isApproval(m.approval) ? { approval: m.approval } : {})
    },
    body: match[2] ?? ''
  };
}

function isApproval(value: unknown): value is { at: string; revision: string } {
  return (
    isRecord(value) &&
    typeof value.at === 'string' &&
    !Number.isNaN(Date.parse(value.at)) &&
    typeof value.revision === 'string' &&
    /^[a-f0-9]{64}$/.test(value.revision)
  );
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
