import { validateDocument } from './document.mjs';
export function validatePrdDocument(text: string) {
  return validateDocument(text, [
    '# Product Requirements',
    '## Purpose',
    '## Users',
    '## Scope',
    '## Requirements',
    '## Constraints',
    '## Non-goals'
  ]);
}
