import { validateDocument } from './document.mjs';
import { ENGINEERING_PROFILE_IDS } from './engineering-profile.js';

export const ENGINEERING_HEADINGS = [
  '# Engineering',
  '## System shape',
  '## Modules and ownership',
  '## Dependency direction and boundaries',
  '## Vertical slices and code organization',
  '## Naming and readability conventions',
  '## Data ownership and persistence',
  '## Error handling',
  '## Testing and verification',
  '## Dependencies and external services',
  '## Security and operations',
  '## Deterministic gates',
  '## Deferred complexity',
  '## Exceptions'
];

export function validateEngineeringDocument(text: string) {
  const result = validateDocument(text, ENGINEERING_HEADINGS);
  const baseline = isRecord(result.baseline) ? result.baseline : {};

  if (!ENGINEERING_PROFILE_IDS.includes(baseline.profile as (typeof ENGINEERING_PROFILE_IDS)[number]))
    result.errors.push(`baseline.profile must be one of: ${ENGINEERING_PROFILE_IDS.join(', ')}.`);
  if (!['improve', 'preserve', 'not_applicable'].includes(String(baseline.existing_code_policy)))
    result.errors.push('baseline.existing_code_policy is invalid.');

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
