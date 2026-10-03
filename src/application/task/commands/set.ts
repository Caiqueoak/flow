import {
  commaSeparatedValues,
  fail,
  optionValue,
  projectRoot,
  recordOutput as writeOutput
} from '../../command-runtime.js';
import type { TaskId } from '../../../domain/task/task.js';
import { normalizeMutationResources, normalizeMutationSurfaces } from '../../../domain/work-item/concurrency.mjs';
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
  const surfaceValue = optionValue(args, '--mutation-surfaces');
  const resourceValue = optionValue(args, '--mutation-resources');

  if (title) task.title = title;
  if (dependencies !== undefined) {
    task.depends_on = commaSeparatedValues(dependencies) as TaskId[];
  }
  if (surfaceValue !== undefined || resourceValue !== undefined) {
    task.mutation = {
      ...(task.mutation ?? {}),
      ...(surfaceValue !== undefined
        ? { surfaces: normalizeMutationSurfaces(commaSeparatedValues(surfaceValue)) }
        : {}),
      ...(resourceValue !== undefined
        ? { resources: normalizeMutationResources(commaSeparatedValues(resourceValue)) }
        : {})
    };
  }

  writeYaml(context.tasksFile, context.tasks);
  writeOutput(`${target} updated.`);
}
