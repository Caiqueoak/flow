import assert from 'node:assert/strict';
import test from 'node:test';
import type { Task, TaskCollection } from '../../../task/task.js';
import {
  normalizeMutationSurface,
  validateConcurrentCommitFiles,
  validateConcurrentTaskState
} from '../../concurrency.mjs';

const collection = (workItem: `W${number}`, tasks: Task[]): TaskCollection => ({
  schema_version: 3,
  work_item: workItem,
  tasks
});
const task = (
  id: `T${number}`,
  state: Task['state'] = 'in_progress',
  depends_on: Task['depends_on'] = [],
  surfaces?: string[],
  resources?: string[]
): Task => ({
  id,
  title: id,
  state,
  depends_on,
  ...(surfaces !== undefined || resources !== undefined
    ? {
        mutation: { ...(surfaces !== undefined ? { surfaces } : {}), ...(resources !== undefined ? { resources } : {}) }
      }
    : {})
});

test('first active task remains valid without mutation claims', () => {
  const issues = validateConcurrentTaskState([{ id: 'W001', tasks: collection('W001', [task('T001')]) }], 'W001');
  assert.deepEqual(issues, []);
});

test('one active task requires matching active work-item focus', () => {
  const items = [{ id: 'W001' as const, tasks: collection('W001', [task('T001')]) }];
  assert.ok(validateConcurrentTaskState(items, null).some((issue) => issue.code === 'ACTIVE_WORK_ITEM_REQUIRED'));
  assert.ok(validateConcurrentTaskState(items, 'W002').some((issue) => issue.code === 'ACTIVE_WORK_ITEM_CONFLICT'));
});

test('independent same-work-item tasks with disjoint complete claims are valid', () => {
  const issues = validateConcurrentTaskState(
    [
      {
        id: 'W001',
        tasks: collection('W001', [
          task('T001', 'in_progress', [], ['src/a'], ['resource-a']),
          task('T002', 'in_progress', [], ['src/b'], ['resource-b'])
        ])
      }
    ],
    'W001',
    { concurrency: { tasks: ['W001-T001', 'W001-T002'], workspace: 'shared' } }
  );
  assert.deepEqual(issues, []);
});

test('concurrent tasks require persisted explicit intent matching the active set', () => {
  const items = [
    {
      id: 'W001' as const,
      tasks: collection('W001', [
        task('T001', 'in_progress', [], ['src/a'], []),
        task('T002', 'in_progress', [], ['src/b'], [])
      ])
    }
  ];
  assert.ok(validateConcurrentTaskState(items, 'W001').some((issue) => issue.code === 'CONCURRENCY_INTENT_REQUIRED'));
  assert.ok(
    validateConcurrentTaskState(items, 'W001', {
      concurrency: { tasks: ['W001-T001', 'W001-T003'], workspace: 'isolated' }
    }).some((issue) => issue.code === 'CONCURRENCY_STATE_CONFLICT')
  );
});

test('direct and transitive dependencies block concurrent tasks', () => {
  const direct = validateConcurrentTaskState(
    [
      {
        id: 'W001',
        tasks: collection('W001', [
          task('T001', 'in_progress', [], ['src/a'], []),
          task('T002', 'in_progress', ['T001'], ['src/b'], [])
        ])
      }
    ],
    'W001',
    { concurrency: { tasks: ['W001-T001', 'W001-T002'], workspace: 'shared' } }
  );
  assert.ok(direct.some((issue) => issue.code === 'DEPENDENCY_CONFLICT'));

  const transitive = validateConcurrentTaskState(
    [
      {
        id: 'W001',
        tasks: collection('W001', [
          task('T001', 'in_progress', [], ['src/a'], []),
          task('T002', 'pending', ['T001']),
          task('T003', 'in_progress', ['T002'], ['src/c'], [])
        ])
      }
    ],
    'W001',
    { concurrency: { tasks: ['W001-T001', 'W001-T003'], workspace: 'shared' } }
  );
  assert.ok(transitive.some((issue) => issue.code === 'DEPENDENCY_CONFLICT'));
});

test('overlapping surfaces, shared resources and missing claims block concurrency', () => {
  const overlap = validateConcurrentTaskState(
    [
      {
        id: 'W001',
        tasks: collection('W001', [
          task('T001', 'in_progress', [], ['src/domain'], []),
          task('T002', 'in_progress', [], ['src/domain/task'], [])
        ])
      }
    ],
    'W001',
    { concurrency: { tasks: ['W001-T001', 'W001-T002'], workspace: 'shared' } }
  );
  assert.ok(overlap.some((issue) => issue.code === 'SURFACE_CONFLICT'));

  const shared = validateConcurrentTaskState(
    [
      {
        id: 'W001',
        tasks: collection('W001', [
          task('T001', 'in_progress', [], ['src/a'], ['schema']),
          task('T002', 'in_progress', [], ['src/b'], ['schema'])
        ])
      }
    ],
    'W001',
    { concurrency: { tasks: ['W001-T001', 'W001-T002'], workspace: 'shared' } }
  );
  assert.ok(shared.some((issue) => issue.code === 'RESOURCE_CONFLICT'));

  const missing = validateConcurrentTaskState(
    [{ id: 'W001', tasks: collection('W001', [task('T001'), task('T002', 'in_progress', [], ['src/b'], [])]) }],
    'W001',
    { concurrency: { tasks: ['W001-T001', 'W001-T002'], workspace: 'shared' } }
  );
  assert.ok(missing.some((issue) => issue.code === 'MISSING_MUTATION_CLAIMS'));
});

test('cross-work-item active tasks and checkpoint concurrency are invalid', () => {
  const cross = validateConcurrentTaskState(
    [
      { id: 'W001', tasks: collection('W001', [task('T001', 'in_progress', [], ['src/a'], [])]) },
      { id: 'W002', tasks: collection('W002', [task('T001', 'in_progress', [], ['src/b'], [])]) }
    ],
    'W001'
  );
  assert.ok(cross.some((issue) => issue.code === 'CROSS_WORK_ITEM_ACTIVE_TASKS'));
  assert.ok(cross.some((issue) => issue.code === 'ACTIVE_WORK_ITEM_CONFLICT'));

  const checkpoint = validateConcurrentTaskState(
    [
      {
        id: 'W001',
        tasks: collection('W001', [
          task('T001', 'in_progress', [], ['src/a'], []),
          task('T002', 'in_progress', [], ['src/b'], [])
        ])
      }
    ],
    'W001',
    { checkpointActive: true, concurrency: { tasks: ['W001-T001', 'W001-T002'], workspace: 'shared' } }
  );
  assert.ok(checkpoint.some((issue) => issue.code === 'CHECKPOINT_CONFLICT'));
});

test('mutation surfaces normalize POSIX and Windows separators and reject unsafe forms', () => {
  assert.equal(normalizeMutationSurface('./src/domain/'), 'src/domain');
  assert.equal(normalizeMutationSurface('src\\domain\\task'), 'src/domain/task');
  assert.throws(() => normalizeMutationSurface('/absolute/path'), /repository-relative/);
  assert.throws(() => normalizeMutationSurface('C:\\absolute\\path'), /repository-relative/);
  assert.throws(() => normalizeMutationSurface('\\absolute\\path'), /repository-relative/);
  assert.throws(() => normalizeMutationSurface('../escape'), /traversal/);
  assert.throws(() => normalizeMutationSurface('src/**'), /glob/);
});

test('concurrent commit files must stay in the task claim and out of other active claims', () => {
  const current = task('T001', 'in_progress', [], ['src/a'], []);
  const other = task('T002', 'in_progress', [], ['src/b'], []);
  assert.deepEqual(validateConcurrentCommitFiles(current, [other], ['src/a/file.ts']), []);
  assert.ok(validateConcurrentCommitFiles(current, [other], ['README.md']).some((message) => /outside/.test(message)));
  assert.ok(
    validateConcurrentCommitFiles(current, [other], ['src/b/file.ts']).some((message) =>
      /another active task/.test(message)
    )
  );
});
