import { parseDocument, stringify } from 'yaml';
import { ArtifactValidationError } from './backlog.mjs';
import { REVIEW_SCHEMA_VERSION, WORK_ITEM_ID, type WorkItemId } from './work-item.js';

export interface SerializedWorkItemReview {
  schema_version: number;
  work_item: WorkItemId;
  status: 'pending' | 'approved';
  reviewed_at?: string;
}

export function parseReview(
  text: string,
  { expectedWorkItem = null, source = 'review.yaml' }: { expectedWorkItem?: string | null; source?: string } = {}
): SerializedWorkItemReview {
  const doc = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (doc.errors.length)
    throw new ArtifactValidationError(`${source} is invalid: ${doc.errors[0]?.message ?? 'unknown YAML error'}`);
  const v: unknown = doc.toJS();
  if (!isRecord(v)) throw new ArtifactValidationError(`${source} must be a mapping.`);
  if (v.schema_version !== REVIEW_SCHEMA_VERSION)
    throw new ArtifactValidationError(`${source} schema_version must be ${REVIEW_SCHEMA_VERSION}.`);
  if (
    typeof v.work_item !== 'string' ||
    !WORK_ITEM_ID.test(v.work_item) ||
    (expectedWorkItem && v.work_item !== expectedWorkItem)
  )
    throw new ArtifactValidationError(`${source} has an invalid work_item.`);
  if (typeof v.status !== 'string' || !['pending', 'approved'].includes(v.status))
    throw new ArtifactValidationError(`${source}.status must be pending or approved.`);
  if (
    v.status === 'approved' &&
    v.reviewed_at !== undefined &&
    (typeof v.reviewed_at !== 'string' || Number.isNaN(Date.parse(v.reviewed_at)))
  )
    throw new ArtifactValidationError(`${source}.reviewed_at must be ISO.`);
  return {
    schema_version: REVIEW_SCHEMA_VERSION,
    work_item: v.work_item as WorkItemId,
    status: v.status as 'pending' | 'approved',
    ...(typeof v.reviewed_at === 'string' && v.reviewed_at ? { reviewed_at: v.reviewed_at } : {})
  };
}
export const stringifyReview = (value: SerializedWorkItemReview): string =>
  stringify(parseReview(stringify(value)), { lineWidth: 0 });

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
