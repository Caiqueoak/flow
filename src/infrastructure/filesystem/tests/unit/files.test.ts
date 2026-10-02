import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { atomicWriteText } from '../../files.js';

test('atomic text replacement preserves the previous file when candidate validation fails', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-atomic-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'state.yaml');
  fs.writeFileSync(file, 'previous\n');

  assert.throws(
    () =>
      atomicWriteText(file, 'invalid\n', {
        validate: () => {
          throw new Error('invalid candidate');
        }
      }),
    /invalid candidate/
  );

  assert.equal(fs.readFileSync(file, 'utf8'), 'previous\n');
  assert.deepEqual(fs.readdirSync(root).filter((name) => name.includes('.flow-tmp-')), []);
});

test('atomic text replacement publishes the complete candidate', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-atomic-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'artifact.md');
  fs.writeFileSync(file, 'old\n');

  atomicWriteText(file, 'new\n');

  assert.equal(fs.readFileSync(file, 'utf8'), 'new\n');
});
