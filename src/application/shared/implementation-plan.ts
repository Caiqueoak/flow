import { createHash } from 'node:crypto';
import { parse, stringify } from 'yaml';

export interface ImplementationPlanMetadata {
  schema_version?: number;
  work_item?: string;
  status?: string;
  approval?: {
    at: string;
    revision: string;
  };
  [key: string]: unknown;
}

export interface ParsedImplementationPlan {
  metadata: ImplementationPlanMetadata;
  body: string;
}

export function parseImplementationPlan(text: string): ParsedImplementationPlan | null {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---([\s\S]*)$/);
  if (!match) return null;

  return {
    metadata: (parse(match[1]) ?? {}) as ImplementationPlanMetadata,
    body: match[2]
  };
}

export function serializeImplementationPlan(
  metadata: ImplementationPlanMetadata,
  body: string
): string {
  return `---\n${stringify(metadata).trimEnd()}\n---${body}`;
}

export function implementationPlanRevision(
  metadata: ImplementationPlanMetadata,
  body: string
): string {
  const stableMetadata = { ...metadata };
  delete stableMetadata.approval;

  return createHash('sha256')
    .update(serializeImplementationPlan(stableMetadata, body))
    .digest('hex');
}

export function isImplementationPlanApproved(text: string): boolean {
  const plan = parseImplementationPlan(text);
  if (!plan) return false;

  return (
    plan.metadata.status === 'approved' &&
    plan.metadata.approval?.revision === implementationPlanRevision(plan.metadata, plan.body)
  );
}
