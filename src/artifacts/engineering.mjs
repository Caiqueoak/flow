import { validateDocument } from './document.mjs';
import { ENGINEERING_PROFILE_IDS } from '../shared/profiles.mjs';

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

export function validateEngineeringDocument(text) {
  const result = validateDocument(text, ENGINEERING_HEADINGS);

  if (!ENGINEERING_PROFILE_IDS.includes(result.baseline?.profile))
    result.errors.push(`baseline.profile must be one of: ${ENGINEERING_PROFILE_IDS.join(', ')}.`);
  if (!['improve', 'preserve', 'not_applicable'].includes(result.baseline?.existing_code_policy))
    result.errors.push('baseline.existing_code_policy is invalid.');

  return result;
}
