import { parse, stringify } from 'yaml';

export interface ImplementationPlanMetadata {
  schema_version?: number;
  work_item?: string;
  engineering_revision?: string;
  spec_revision?: string;
  tasks_revision?: string;
  [key: string]: unknown;
}

export interface ParsedImplementationPlan {
  metadata: ImplementationPlanMetadata;
  body: string;
}

export function parseImplementationPlan(text: string): ParsedImplementationPlan | null {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---([\s\S]*)$/);
  if (!match?.[1] || match[2] === undefined) return null;
  return { metadata: (parse(match[1]) ?? {}) as ImplementationPlanMetadata, body: match[2] };
}

export function serializeImplementationPlan(metadata: ImplementationPlanMetadata, body: string): string {
  return `---\n${stringify(metadata).trimEnd()}\n---${body}`;
}
