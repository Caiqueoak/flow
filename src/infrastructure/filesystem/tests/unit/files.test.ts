import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { atomicWriteText } from '../../files.js';

test('atomic write preserves the previous canonical file when replacement fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-atomic-write-'));
  const file = path.join(root, 'state.yaml');
  fs.writeFileSync(file, 'previous', 'utf8');

  assert.throws(
    () =>
      atomicWriteText(file, 'candidate', {
        replace: () => {
          throw new Error('replace failed');
        }
      }),
    /replace failed/
  );
  assert.equal(fs.readFileSync(file, 'utf8'), 'previous');
  assert.deepEqual(fs.readdirSync(root), ['state.yaml']);
});

test('atomic write validates candidate content before replacement', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-atomic-validation-'));
  const file = path.join(root, 'canonical.yaml');
  fs.writeFileSync(file, 'previous', 'utf8');

  assert.throws(
    () =>
      atomicWriteText(file, 'invalid', {
        validate: () => {
          throw new Error('invalid candidate');
        }
      }),
    /invalid candidate/
  );
  assert.equal(fs.readFileSync(file, 'utf8'), 'previous');
  assert.deepEqual(fs.readdirSync(root), ['canonical.yaml']);
});
