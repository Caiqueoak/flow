import { createHash } from 'node:crypto';
import { parseDocument, stringify } from 'yaml';

export interface ProjectDocumentApproval {
  at: string;
  revision: string;
}

export interface DocumentMetadata {
  schema_version?: number;
  status?: string;
  approved_at?: string;
  approval?: ProjectDocumentApproval;
  [key: string]: unknown;
}

export interface ParsedProjectDocument {
  metadata: DocumentMetadata;
  body: string;
}

export interface DocumentValidation extends DocumentMetadata {
  errors: string[];
}

export function parseProjectDocument(text: string): ParsedProjectDocument {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error('Missing YAML frontmatter.');
  const doc = parseDocument(match[1] ?? '', { prettyErrors: false, uniqueKeys: true });
  if (doc.errors.length) throw new Error(doc.errors[0]?.message ?? 'Invalid YAML frontmatter.');
  const value: unknown = doc.toJS();
  if (!isRecord(value)) throw new Error('Frontmatter must be a mapping.');
  return { metadata: value, body: match[2] ?? '' };
}

export function serializeProjectDocument(metadata: DocumentMetadata, body: string): string {
  return `---\n${stringify(metadata, { lineWidth: 0 }).trimEnd()}\n---\n${body}`;
}

export function documentRevision(text: string): string {
  const { metadata, body } = parseProjectDocument(text);
  const normalized = { ...metadata };
  delete normalized.status;
  delete normalized.approved_at;
  delete normalized.approval;
  return createHash('sha256').update(serializeProjectDocument(normalized, body)).digest('hex');
}

export function documentMetadata(text: string): DocumentMetadata {
  return parseProjectDocument(text).metadata;
}

export function approveProjectDocument(
  text: string,
  approvedAt: string
): {
  text: string;
  revision: string;
} {
  if (Number.isNaN(Date.parse(approvedAt))) throw new Error('Approval timestamp must be valid ISO time.');
  const parsed = parseProjectDocument(text);
  const metadata: DocumentMetadata = {
    ...parsed.metadata,
    schema_version: 2,
    status: 'approved'
  };
  delete metadata.approved_at;
  delete metadata.approval;
  const unapproved = serializeProjectDocument(metadata, parsed.body);
  const revision = documentRevision(unapproved);
  metadata.approval = { at: new Date(approvedAt).toISOString(), revision };
  return { text: serializeProjectDocument(metadata, parsed.body), revision };
}

export function isProjectDocumentApproved(text: string): boolean {
  try {
    const { metadata } = parseProjectDocument(text);
    return (
      metadata.schema_version === 2 &&
      metadata.status === 'approved' &&
      isApproval(metadata.approval) &&
      metadata.approval.revision === documentRevision(text)
    );
  } catch {
    return false;
  }
}

export function validateDocument(
  text: string,
  headings: readonly string[],
  { requireV2 = false }: { requireV2?: boolean } = {}
): DocumentValidation {
  let metadata: DocumentMetadata = {};
  const errors: string[] = [];
  try {
    metadata = documentMetadata(text);
  } catch (error: unknown) {
    errors.push(errorMessage(error));
  }

  const supportedVersion = metadata.schema_version === 1 || metadata.schema_version === 2;
  if (!supportedVersion || (requireV2 && metadata.schema_version !== 2))
    errors.push(requireV2 ? 'schema_version must be 2.' : 'schema_version must be 1 or 2.');

  if (typeof metadata.status !== 'string' || !['draft', 'approved'].includes(metadata.status))
    errors.push('status must be draft or approved.');

  if (metadata.status === 'approved') {
    if (metadata.schema_version === 1) {
      if (typeof metadata.approved_at !== 'string' || Number.isNaN(Date.parse(metadata.approved_at)))
        errors.push('approved_at must record the human approval timestamp.');
    } else if (!isApproval(metadata.approval)) {
      errors.push('approval must record a valid at timestamp and 64-hex revision.');
    }
  }

  const actual = new Set(text.split(/\r?\n/).filter((line) => /^#{1,2} /.test(line)));
  for (const heading of headings) if (!actual.has(heading)) errors.push(`Missing ${heading}.`);
  return { ...metadata, errors };
}

function isApproval(value: unknown): value is ProjectDocumentApproval {
  return (
    isRecord(value) &&
    typeof value.at === 'string' &&
    !Number.isNaN(Date.parse(value.at)) &&
    typeof value.revision === 'string' &&
    /^[a-f0-9]{64}$/.test(value.revision)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
