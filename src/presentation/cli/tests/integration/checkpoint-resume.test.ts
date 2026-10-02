import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { runCli } from '../dispatch-command.js';

async function flow(root: string, args: string[]) {
  const output: string[] = [];
  const original = console.log;
  console.log = (...values: unknown[]) => output.push(values.map(String).join(' '));
  try {
    await runCli([...args, '--path', root]);
  } finally {
    console.log = original;
  }
  return output.join('\n');
}

function project(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-checkpoint-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function data(state: 'unresolved' | 'resolved') {
  return JSON.stringify({
    phase: 'discovery',
    step: 'explore_product',
    target: { kind: 'project_document', ref: '_flow/docs/prd.md', revision: null },
    inputs: [],
    dimensions: [{ id: 'D001', state, summary: 'Choose offline behavior.' }],
    assumptions: [],
    latest_authorized_direction: 'Keep the MVP narrow.',
    next_frontier: state === 'unresolved' ? ['D001'] : []
  });
}

test('checkpoint CLI persists resumable state without hand-editing state.yaml', async (t) => {
  const root = project(t);
  await flow(root, ['init', '--runtime', 'codex']);

  const stateFile = path.join(root, '_flow', 'state.yaml');
  assert.equal(parse(fs.readFileSync(stateFile, 'utf8')).schema_version, 3);

  assert.equal(await flow(root, ['checkpoint', 'begin', '--data', data('unresolved')]), 'Checkpoint started.');
  assert.deepEqual(parse(fs.readFileSync(stateFile, 'utf8')).checkpoint.next_frontier, ['D001']);

  assert.equal(await flow(root, ['checkpoint', 'update', '--data', data('resolved')]), 'Checkpoint updated.');
  assert.equal(
    await flow(root, ['checkpoint', 'ready', '--target-revision', 'prd-rev-1']),
    'Checkpoint is approval-ready.'
  );
  assert.equal(parse(fs.readFileSync(stateFile, 'utf8')).checkpoint.status, 'approval_ready');

  assert.equal(
    await flow(root, [
      'checkpoint',
      'clear',
      '--target-ref',
      '_flow/docs/prd.md',
      '--target-revision',
      'prd-rev-1'
    ]),
    'Checkpoint cleared.'
  );
  assert.equal(parse(fs.readFileSync(stateFile, 'utf8')).checkpoint, null);
});
