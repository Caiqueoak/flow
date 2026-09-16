import { fail, info } from '../../shared/cli-io.mjs';
import { positionalArguments } from '../../shared/cli/arguments.js';
import type { QualifiedTaskId } from '../../shared/domain/task.js';
import { projectRoot } from '../../shared/project-path.mjs';
import { commitTask } from './commit.js';
import { createTask } from './create.js';
import { findTask, loadTaskContext } from './shared.js';
import { startTask } from './start.js';
import { updateTask } from './update.js';

export function runTask({ args }: { args: string[] }): void {
  const root = projectRoot(args);
  const [action, target] = positionalArguments(args);
  const context = loadTaskContext(root, target);

  if (action === 'create') {
    createTask(context.item, context.tasksFile, context.tasks, args);
    return;
  }

  const task = findTask(context.tasks.tasks, target);

  switch (action) {
    case 'start':
      startTask(root, context.item, context.tasksFile, context.tasks, task);
      info(`${target} started.`);
      return;
    case 'set':
      updateTask(context.tasksFile, context.tasks, task, args);
      info(`${target} updated.`);
      return;
    case 'commit':
      commitTask(root, context.item, context.tasksFile, context.tasks, task, target as QualifiedTaskId, args);
      return;
    default:
      fail(`Unknown task operation '${action}'.`);
  }
}
