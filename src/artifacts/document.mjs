import { parseDocument } from 'yaml';
import { createHash } from 'node:crypto';
export function documentRevision(text) {
  return createHash('sha256').update(text).digest('hex');
}
export function documentMetadata(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('Missing YAML frontmatter.');
  const doc = parseDocument(match[1], { uniqueKeys: true });
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  const value = doc.toJS();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Frontmatter must be a mapping.');
  return value;
}
export function validateDocument(text, headings) {
  let metadata = {};
  const errors = [];
  try {
    metadata = documentMetadata(text);
  } catch (error) {
    errors.push(error.message);
  }
  if (metadata.schema_version !== 1) errors.push('schema_version must be 1.');
  if (!['draft', 'approved'].includes(metadata.status)) errors.push('status must be draft or approved.');
  if (metadata.status === 'approved' && (!metadata.approved_at || Number.isNaN(Date.parse(metadata.approved_at))))
    errors.push('approved_at must record the human approval timestamp.');
  const actual = new Set(text.split(/\r?\n/).filter((line) => /^#{1,2} /.test(line)));
  for (const heading of headings) if (!actual.has(heading)) errors.push(`Missing ${heading}.`);
  return { ...metadata, errors };
}
