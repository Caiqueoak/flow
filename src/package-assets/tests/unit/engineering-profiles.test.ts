import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseProfileFrontmatter } from '../../engineering-profiles.mjs';
import { defaultConfig } from '../../../flow-project/configuration.mjs';

const v1Profile = readFileSync('skills/flow/engineering/profiles/readability-first.md', 'utf8');
const v2Profile = readFileSync('skills/flow/engineering/profiles/readability-first-v2.md', 'utf8');

test('new projects default to readability-first v2 while v1 stays versioned', () => {
  assert.equal(defaultConfig().engineering.profile, 'flow/readability-first@2');
  assert.equal(parseProfileFrontmatter(v1Profile).id, 'flow/readability-first@1');
  assert.equal(parseProfileFrontmatter(v2Profile).id, 'flow/readability-first@2');
});

test('readability-first v2 keeps the agent-facing architecture rules explicit', () => {
  assert.match(v2Profile, /Prefer vertical slices/);
  assert.match(v2Profile, /small shared kernel/);
  assert.match(v2Profile, /Declarative at the domain and orchestration level/);
  assert.match(v2Profile, /Apply SRP/);
  assert.match(v2Profile, /Apply SSOT/);
  assert.match(v2Profile, /strongest type system/);
  assert.match(v2Profile, /magic numbers/);
  assert.match(v2Profile, /system boundaries/);
  assert.match(v2Profile, /behavior-preserving structural refactors/);
});
