import { projectPathOption } from '../../cli/command-input/options.js';
import type { CommandDefinition } from '../../cli/command-metadata/definition.js';
import { positionalArguments } from '../../cli/command-input/arguments.js';
import { fail, writeOutput } from '../../cli/terminal/output.js';
import { projectRoot } from '../../cli/command-input/project-root.js';
import type { QualifiedTaskId } from '../../contracts/task.js';
import { commitTask } from './usecases/commit.js';
import { createTask } from './usecases/create.js';
import { startTask } from './usecases/start.js';
import { updateTask } from './usecases/set.js';
import { findTask, loadTaskContext } from './task-context.js';
export const command: CommandDefinition = {
  name: 'task',
  description: 'Create, update, start or commit tasks.',
  usage: 'flow task <create|set|start|commit> W###[-T###] [options]',
  arguments: [{ name: 'operation', required: true }],
  flags: [
    projectPathOption,
    { name: '--title', value: '<text>' },
    { name: '--depends-on', value: '<T###,...>' },
    { name: '--message', value: '<objective commit title>' },
    { name: '--files', value: '<path,...>' }
  ],
  effects: 'Task commit creates the one canonical implementation commit.',
  when: 'Only after spec maturity is ready.',
  load: async () => ({ runTask }),
  run: 'runTask'
};

export function runTask({ args }: { args: string[] }): void {
  const root = projectRoot(args);
  const [action, target] = positionalArguments(args);
  const context = loadTaskContext(root, target);
  if (action === 'create') return createTask(context.item, context.tasksFile, context.tasks, args);
  const task = findTask(context.tasks.tasks, target);
  if (action === 'start') {
    startTask(root, context.item, context.tasksFile, context.tasks, task);
    return writeOutput(`${target} started.`);
  }
  if (action === 'set') {
    updateTask(context.tasksFile, context.tasks, task, args);
    return writeOutput(`${target} updated.`);
  }
  if (action === 'commit')
    return commitTask(root, context.item, context.tasksFile, context.tasks, task, target as QualifiedTaskId, args);
  fail(`Unknown task operation '${action}'.`);
}
