import { documentRevision, validateDocument } from './document.mjs';
export { documentRevision } from './document.mjs';
export const PLAN_HEADINGS = [
  '# Implementation Plan',
  '## Outcome',
  '## Current state',
  '## Proposed changes',
  '## Execution sequence',
  '## Task mapping',
  '## Data and control flow',
  '## Engineering compliance',
  '## Tests and validation',
  '## Risks and rollback',
  '## Deliberately excluded',
  '## Human decisions required'
];
export function validateImplementationPlan(text, { workItem, engineeringText, specText, checkRevisions = true }) {
  const result = validateDocument(text, PLAN_HEADINGS);
  if (result.work_item !== workItem) result.errors.push('Plan belongs to a different work item.');
  for (const key of ['engineering_revision', 'spec_revision'])
    if (!/^[a-f0-9]{64}$/.test(result[key] ?? '')) result.errors.push(`${key} must be SHA256.`);
  if (checkRevisions && result.engineering_revision !== documentRevision(engineeringText))
    result.errors.push('Engineering revision is stale.');
  if (checkRevisions && result.spec_revision !== documentRevision(specText))
    result.errors.push('Spec revision is stale.');
  return result;
}
