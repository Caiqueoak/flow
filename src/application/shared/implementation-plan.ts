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
  const frontmatter = match?.[1];
  const body = match?.[2];

  if (frontmatter === undefined || body === undefined) {
    return null;
  }

  return {
    metadata: (parse(frontmatter) ?? {}) as ImplementationPlanMetadata,
    body
  };
}

export function serializeImplementationPlan(metadata: ImplementationPlanMetadata, body: string): string {
  return `---\n${stringify(metadata).trimEnd()}\n---${body}`;
}

export function implementationPlanRevision(metadata: ImplementationPlanMetadata, body: string): string {
  const stableMetadata = { ...metadata };
  delete stableMetadata.approval;

  return createHash('sha256').update(serializeImplementationPlan(stableMetadata, body)).digest('hex');
}

export function isImplementationPlanApproved(text: string): boolean {
  const plan = parseImplementationPlan(text);
  if (!plan) return false;

  return (
    plan.metadata.status === 'approved' &&
    plan.metadata.approval?.revision === implementationPlanRevision(plan.metadata, plan.body)
  );
}
