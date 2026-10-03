import { validateDocument } from './document.mjs';

export const EXPERIENCE_RELEVANCE = ['required', 'not_required'] as const;
export type ExperienceRelevance = (typeof EXPERIENCE_RELEVANCE)[number];

export function validatePrdDocument(text: string) {
  const result = validateDocument(text, [
    '# Product Requirements',
    '## Purpose',
    '## Users',
    '## Scope',
    '## Requirements',
    '## Constraints',
    '## Non-goals'
  ]);

  if (result.schema_version === 2 && !EXPERIENCE_RELEVANCE.includes(result.experience as ExperienceRelevance)) {
    result.errors.push('experience must be required or not_required for schema_version 2.');
  }

  return result;
}

export function prdExperienceRelevance(text: string): ExperienceRelevance {
  const result = validatePrdDocument(text);
  if (result.errors.length) throw new Error(result.errors.join(' '));
  if (result.schema_version === 1 && result.experience === undefined) return 'not_required';
  if (EXPERIENCE_RELEVANCE.includes(result.experience as ExperienceRelevance))
    return result.experience as ExperienceRelevance;
  throw new Error('PRD experience relevance is invalid.');
}
