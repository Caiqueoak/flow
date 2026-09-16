import assert from 'node:assert/strict';
import test from 'node:test';
import { nextTaskId } from '../../../../dist/commands/task/task-context.js';

test('nextTaskId assigns the first sequential local task identifier', () => {
  assert.equal(nextTaskId([]), 'T001');
  assert.equal(
    nextTaskId([
      { id: 'T004', title: 'Older task', state: 'completed', depends_on: [] },
      { id: 'T010', title: 'Latest task', state: 'pending', depends_on: [] }
    ]),
    'T011'
  );
});
