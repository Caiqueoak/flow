import { commaSeparatedValues, requiredOption, optionValue } from '../../../cli/command-input/arguments.js';
import { writeOutput } from '../../../cli/terminal/output.js';
import type { TaskCollection, TaskId } from '../../../contracts/task.js';
import type { LoadedWorkItem } from '../../../contracts/work-item.js';
import { writeYaml } from '../../../environment/filesystem.js';
import { nextTaskId } from '../task-context.js';

export function createTask(
  item: LoadedWorkItem,
  tasksFile: string,
  tasks: TaskCollection,
  args: readonly string[]
): void {
  const title = requiredOption(args, '--title');
  const taskId = nextTaskId(tasks.tasks);

  tasks.tasks.push({
    id: taskId,
    title,
    state: 'pending',
    depends_on: commaSeparatedValues(optionValue(args, '--depends-on')) as TaskId[]
  });

  writeYaml(tasksFile, tasks);
  writeOutput(`${item.id}-${taskId} created.`);
}
