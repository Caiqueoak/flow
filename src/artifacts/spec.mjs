export const SPEC_HEADINGS = Object.freeze([
  '# Work Item Specification',
  '## Problem',
  '## Scope',
  '## Non-goals',
  '## Requirements',
  '## Acceptance criteria',
  '## Contracts',
  '## Data and APIs',
  '## Edge cases',
  '## Risks',
  '## Decisions',
  '## Gates'
]);

export function validateSpec(text) {
  const lines = new Set(text.split(/\r?\n/));
  const errors = SPEC_HEADINGS.filter((heading) => !lines.has(heading)).map((heading) => `Missing ${heading}.`);
  return { valid: errors.length === 0, errors };
}
