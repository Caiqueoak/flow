import {
  commaSeparatedValues,
  optionValue,
  requiredOption
} from '../../../presentation/cli/command-input/arguments.js';
import { projectRoot } from '../../../presentation/cli/command-input/project-root.js';
import { writeOutput } from '../../../presentation/cli/terminal/output.js';
import type { TaskId } from '../../../domain/task/task.js';
import { writeYaml } from '../../../infrastructure/filesystem/index.js';
import { loadTaskContext, nextTaskId } from '../task-context.js';

export function runCreate(target: string | undefined, args: readonly string[]): void {
  const context = loadTaskContext(projectRoot(args), target);
  const title = requiredOption(args, '--title');
  const taskId = nextTaskId(context.tasks.tasks);

  context.tasks.tasks.push({
    id: taskId,
    title,
    state: 'pending',
    depends_on: commaSeparatedValues(optionValue(args, '--depends-on')) as TaskId[]
  });

  writeYaml(context.tasksFile, context.tasks);
  writeOutput(`${context.item.id}-${taskId} created.`);
}
