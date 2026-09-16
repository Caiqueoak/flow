import { LIFECYCLE_STATES } from './constants.js';

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
