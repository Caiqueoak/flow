import { fail } from '../../shared/cli-io.mjs';
import { commaSeparatedValues, optionValue } from '../../shared/cli/arguments.js';
import type { Task, TaskCollection, TaskId } from '../../shared/domain/task.js';
import { writeYaml } from '../../shared/filesystem/files.js';

export function updateTask(tasksFile: string, tasks: TaskCollection, task: Task, args: readonly string[]): void {
  if (task.state !== 'pending') {
    fail('Only pending tasks can be changed.');
  }

  const title = optionValue(args, '--title');
  const dependencies = optionValue(args, '--depends-on');

  if (title) task.title = title;
  if (dependencies !== undefined) {
    task.depends_on = commaSeparatedValues(dependencies) as TaskId[];
  }

  writeYaml(tasksFile, tasks);
}
