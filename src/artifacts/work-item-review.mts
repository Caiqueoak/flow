// @ts-nocheck
import { parseDocument, stringify } from 'yaml';
import { ArtifactValidationError } from './backlog.mjs';
import { REVIEW_SCHEMA_VERSION, WORK_ITEM_ID } from '../contracts/contracts.js';
export function parseReview(text, { expectedWorkItem = null, source = 'review.yaml' } = {}) {
  const doc = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (doc.errors.length) throw new ArtifactValidationError(`${source} is invalid: ${doc.errors[0].message}`);
  const v = doc.toJS();
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new ArtifactValidationError(`${source} must be a mapping.`);
  if (v.schema_version !== REVIEW_SCHEMA_VERSION)
    throw new ArtifactValidationError(`${source} schema_version must be ${REVIEW_SCHEMA_VERSION}.`);
  if (!WORK_ITEM_ID.test(v.work_item ?? '') || (expectedWorkItem && v.work_item !== expectedWorkItem))
    throw new ArtifactValidationError(`${source} has an invalid work_item.`);
  if (!['pending', 'approved'].includes(v.status))
    throw new ArtifactValidationError(`${source}.status must be pending or approved.`);
  if (v.status === 'approved' && v.reviewed_at !== undefined && Number.isNaN(Date.parse(v.reviewed_at)))
    throw new ArtifactValidationError(`${source}.reviewed_at must be ISO.`);
  return {
    schema_version: REVIEW_SCHEMA_VERSION,
    work_item: v.work_item,
    status: v.status,
    ...(v.reviewed_at ? { reviewed_at: v.reviewed_at } : {})
  };
}
export const stringifyReview = (value) => stringify(parseReview(stringify(value)), { lineWidth: 0 });
