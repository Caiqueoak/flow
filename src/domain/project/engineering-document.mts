import { validateDocument } from './document.mjs';
import { ENGINEERING_PROFILE_IDS } from './engineering-profile.js';

export const ENGINEERING_HEADINGS = [
  '# Engineering',
  '## Observed system',
  '## Adoption strategy',
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
  '## Exceptions',
];

export const ENGINEERING_TOPOLOGY_HEADINGS = [
  '## System shape',
  '## Modules and ownership',
  '## Dependency direction and boundaries',
  '## Vertical slices and code organization',
  '## Naming and readability conventions',
] as const;

const TOPOLOGY_PLACEHOLDERS = new Set(['not applicable', 'n/a', 'tbd', 'todo', 'deferred']);

export function validateEngineeringDocument(text: string) {
  const result = validateDocument(text, ENGINEERING_HEADINGS);
  const baseline = isRecord(result.baseline) ? result.baseline : {};

  if (
    !ENGINEERING_PROFILE_IDS.includes(
      baseline.profile as (typeof ENGINEERING_PROFILE_IDS)[number],
    )
  )
    result.errors.push(`baseline.profile must be one of: ${ENGINEERING_PROFILE_IDS.join(', ')}.`);
  if (
    !['preserve', 'incremental', 'refactor', 'not_applicable'].includes(
      String(baseline.existing_code_policy),
    )
  )
    result.errors.push('baseline.existing_code_policy is invalid.');

  for (const heading of ENGINEERING_TOPOLOGY_HEADINGS) {
    if (!hasHeading(text, heading)) continue;
    const body = sectionBody(text, heading);
    if (!body || isTopologyPlaceholder(body))
      result.errors.push(`${heading} must define a concrete project architecture/topology contract.`);
  }

  return result;
}

function hasHeading(text: string, heading: string): boolean {
  return text.split(/\r?\n/).some((line) => line.trim() === heading);
}

function sectionBody(text: string, heading: string): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return '';

  const endOffset = lines.slice(start + 1).findIndex((line) => /^#{1,2} /.test(line));
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset;
  return lines.slice(start + 1, end).join('\n').trim();
}

function isTopologyPlaceholder(body: string): boolean {
  const normalized = body.toLowerCase().replace(/[.!:;]+$/g, '').trim();
  return TOPOLOGY_PLACEHOLDERS.has(normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
