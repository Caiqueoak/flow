import { info } from '../../shared/cli-io.mjs';
import { commaSeparatedValues, requiredOption, optionValue } from '../../shared/cli/arguments.js';
import type { TaskCollection, TaskId } from '../../shared/domain/task.js';
import type { LoadedWorkItem } from '../../shared/domain/work-item.js';
import { writeYaml } from '../../shared/filesystem/files.js';
import { nextTaskId } from './shared.js';

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
  info(`${item.id}-${taskId} created.`);
}
