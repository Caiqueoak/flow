import fs from 'node:fs';
import { parse } from 'yaml';
const text = fs.readFileSync(
  new URL('../../skills/flow/engineering/profiles/readability-first.md', import.meta.url),
  'utf8'
);
export function parseProfileFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('Missing YAML frontmatter in Flow profile.');
  return parse(match[1]);
}
export const READABILITY_FIRST_PROFILE = parseProfileFrontmatter(text);
export const ENGINEERING_PROFILES = {
  'readability-first': READABILITY_FIRST_PROFILE,
  [READABILITY_FIRST_PROFILE.id]: READABILITY_FIRST_PROFILE
};
export const BROWNFIELD_POLICIES = {
  improve: {
    label: 'Improve existing structure — Recommended',
    description:
      'Preserve behavior and external contracts; recommend clearer structure where justified. Does not authorize refactoring.'
  },
  preserve: {
    label: 'Keep existing structure',
    description: 'Retain consistent conventions unless a concrete problem warrants an approved change.'
  }
};
