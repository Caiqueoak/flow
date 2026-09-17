import { TASK_COMMIT_TYPES, type QualifiedTaskId } from './task.js';

export function isValidTaskCommitSubject(subject: string, taskId: QualifiedTaskId): boolean {
  return taskCommitSubjectPattern(taskId).test(subject);
}

function taskCommitSubjectPattern(taskId: QualifiedTaskId): RegExp {
  const escapedTaskId = escapeRegex(taskId);
  const commitTypes = TASK_COMMIT_TYPES.join('|');

  return new RegExp(`^(?:${commitTypes})\\([a-z0-9][a-z0-9-]*\\): .+ \\[${escapedTaskId}\\]$`);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
