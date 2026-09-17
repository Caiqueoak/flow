import { parseDocument } from 'yaml';
import { createHash } from 'node:crypto';

export interface DocumentMetadata {
  schema_version?: number;
  status?: string;
  approved_at?: string;
  [key: string]: unknown;
}

export interface DocumentValidation extends DocumentMetadata {
  errors: string[];
}

export function documentRevision(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
export function documentMetadata(text: string): DocumentMetadata {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('Missing YAML frontmatter.');
  const doc = parseDocument(match[1] ?? '', { uniqueKeys: true });
  if (doc.errors.length) throw new Error(doc.errors[0]?.message ?? 'Invalid YAML frontmatter.');
  const value: unknown = doc.toJS();
  if (!isRecord(value)) throw new Error('Frontmatter must be a mapping.');
  return value;
}
export function validateDocument(text: string, headings: readonly string[]): DocumentValidation {
  let metadata: DocumentMetadata = {};
  const errors: string[] = [];
  try {
    metadata = documentMetadata(text);
  } catch (error: unknown) {
    errors.push(errorMessage(error));
  }
  if (metadata.schema_version !== 1) errors.push('schema_version must be 1.');
  if (typeof metadata.status !== 'string' || !['draft', 'approved'].includes(metadata.status))
    errors.push('status must be draft or approved.');
  if (
    metadata.status === 'approved' &&
    (typeof metadata.approved_at !== 'string' || Number.isNaN(Date.parse(metadata.approved_at)))
  )
    errors.push('approved_at must record the human approval timestamp.');
  const actual = new Set(text.split(/\r?\n/).filter((line) => /^#{1,2} /.test(line)));
  for (const heading of headings) if (!actual.has(heading)) errors.push(`Missing ${heading}.`);
  return { ...metadata, errors };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
