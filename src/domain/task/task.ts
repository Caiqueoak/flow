export const TASKS_SCHEMA_VERSION = 3;
export const TASK_ID_PREFIX = 'T';
export const TASK_ID_PATTERN = '^T\\d{3,}$';
export const QUALIFIED_TASK_ID_PATTERN = '^W\\d{3,}-T\\d{3,}$';
export const TASK_ID = new RegExp(TASK_ID_PATTERN);
export const QUALIFIED_TASK_ID = new RegExp(QUALIFIED_TASK_ID_PATTERN);

export const LIFECYCLE_STATES = ['pending', 'in_progress', 'completed'] as const;
export const TASK_COMMIT_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'test',
  'build',
  'ci',
  'chore',
  'perf',
  'revert'
] as const;

export type TaskId = `T${number}`;
export type QualifiedTaskId = `W${number}-T${number}`;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export interface Task {
  id: TaskId;
  title: string;
  state: LifecycleState;
  depends_on: TaskId[];
  provenance?: 'legacy_migration';
  legacy_commit?: string;
}

export interface TaskCollection {
  schema_version: number;
  work_item: `W${number}`;
  tasks: Task[];
}
