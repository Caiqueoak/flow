import assert from 'node:assert/strict';
import test from 'node:test';
import fs, { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseProfileFrontmatter } from '../../engineering-profiles.js';
import { defaultConfig, readConfig } from '../../../persistence/configuration.mjs';

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

test('legacy improve policy normalizes to incremental when config is read', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-legacy-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '_flow'));
  fs.writeFileSync(
    path.join(root, '_flow', 'config.yaml'),
    'schema_version: 4\nflow_version: 0.8.0\nruntimes: []\nengineering:\n  profile: flow/readability-first@2\n  existing_code_policy: improve\n'
  );

  assert.equal(readConfig(root)?.engineering.existing_code_policy, 'incremental');
});
