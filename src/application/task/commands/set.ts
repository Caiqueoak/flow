import { commaSeparatedValues, optionValue } from '../../../presentation/cli/command-input/arguments.js';
import { projectRoot } from '../../../presentation/cli/command-input/project-root.js';
import { fail, writeOutput } from '../../../presentation/cli/terminal/output.js';
import type { TaskId } from '../../../domain/task/task.js';
import { writeYaml } from '../../../infrastructure/filesystem/index.js';
import { findTask, loadTaskContext } from '../task-context.js';

export function runSet(target: string | undefined, args: readonly string[]): void {
  const context = loadTaskContext(projectRoot(args), target);
  const task = findTask(context.tasks.tasks, target);

  if (task.state !== 'pending') {
    fail('Only pending tasks can be changed.');
  }

  const title = optionValue(args, '--title');
  const dependencies = optionValue(args, '--depends-on');

  if (title) task.title = title;
  if (dependencies !== undefined) {
    task.depends_on = commaSeparatedValues(dependencies) as TaskId[];
  }

  writeYaml(context.tasksFile, context.tasks);
  writeOutput(`${target} updated.`);
}
