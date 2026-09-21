import fs from 'node:fs';
import { parse } from 'yaml';
import { ENGINEERING_PROFILE_IDS } from '../../domain/project/engineering-profile.js';

export interface EngineeringProfile {
  id: string;
  label?: string;
  description?: string;
  [key: string]: unknown;
}

export interface BrownfieldPolicy {
  label: string;
  description: string;
}

function readProfile(file: string): EngineeringProfile {
  return parseProfileFrontmatter(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
}

export function parseProfileFrontmatter(text: string): EngineeringProfile {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!match?.[1]) {
    throw new Error('Missing YAML frontmatter in Flow profile.');
  }

  const profile = parse(match[1]) as unknown;

  if (!isEngineeringProfile(profile)) {
    throw new Error('Flow profile requires a string id.');
  }

  return profile;
}

function isEngineeringProfile(value: unknown): value is EngineeringProfile {
  return typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string';
}

export const READABILITY_FIRST_PROFILE_V1 = readProfile(
  '../../../skills/flow/engineering/profiles/readability-first.md'
);
export const READABILITY_FIRST_PROFILE = readProfile(
  '../../../skills/flow/engineering/profiles/readability-first-v2.md'
);

export const ENGINEERING_PROFILES: Record<string, EngineeringProfile | undefined> = {
  'readability-first': READABILITY_FIRST_PROFILE,
  [READABILITY_FIRST_PROFILE_V1.id]: READABILITY_FIRST_PROFILE_V1,
  [READABILITY_FIRST_PROFILE.id]: READABILITY_FIRST_PROFILE
};

export { ENGINEERING_PROFILE_IDS };

export const BROWNFIELD_POLICIES: Record<string, BrownfieldPolicy | undefined> = {
  preserve: {
    label: 'Preserve existing structure',
    description: 'Adopt Flow without restructuring coherent existing architecture or conventions.'
  },
  incremental: {
    label: 'Incremental alignment — Recommended',
    description: 'Preserve unrelated code while new or touched areas move toward the approved engineering direction.'
  },
  refactor: {
    label: 'Refactor first',
    description:
      'Align existing architecture/topology before feature delivery. This expands scope and requires explicit user choice.'
  }
};
