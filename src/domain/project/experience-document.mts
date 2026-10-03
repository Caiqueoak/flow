import { validateDocument } from './document.mjs';

export const EXPERIENCE_HEADINGS = ['# Experience'] as const;

export function validateExperienceDocument(text: string) {
  return validateDocument(text, EXPERIENCE_HEADINGS, { requireV2: true });
}
