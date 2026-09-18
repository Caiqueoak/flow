import { documentRevision } from './document.mjs';
import { parseImplementationPlan } from './implementation-plan.js';
export { documentRevision } from './document.mjs';
export const PLAN_HEADINGS = ['# Implementation Plan', '## Preflight', '## Strategy', '## Execution', '## Validation'];
export interface ImplementationPlanValidationInput {
  workItem: string;
  engineeringText: string;
  specText: string;
  tasksText: string;
  checkRevisions?: boolean;
}

export function validateImplementationPlan(
  text: string,
  { workItem, engineeringText, specText, tasksText, checkRevisions = true }: ImplementationPlanValidationInput
) {
  const plan = parseImplementationPlan(text);
  const errors: string[] = [];
  if (!plan) return { errors: ['implementation-plan.md requires YAML frontmatter.'] };
  const result = { ...plan.metadata, errors };
  if (result.schema_version !== 2) errors.push('schema_version must be 2.');
  if (result.work_item !== workItem) errors.push('Plan belongs to a different work item.');
  for (const key of ['engineering_revision', 'spec_revision', 'tasks_revision'] as const)
    if (!/^[a-f0-9]{64}$/.test(String(result[key] ?? ''))) result.errors.push(`${key} must be SHA256.`);
  const headings = new Set(text.split(/\r?\n/));
  for (const heading of PLAN_HEADINGS) if (!headings.has(heading)) errors.push(`Missing ${heading}.`);
  if (checkRevisions && result.engineering_revision !== documentRevision(engineeringText))
    result.errors.push('Engineering revision is stale.');
  if (checkRevisions && result.spec_revision !== documentRevision(specText))
    result.errors.push('Spec revision is stale.');
  if (checkRevisions && result.tasks_revision !== documentRevision(tasksText))
    result.errors.push('Tasks revision is stale.');
  return result;
}
