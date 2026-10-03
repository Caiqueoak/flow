import { commaSeparatedValues, optionValue, requiredOption } from '../../command-runtime.js';
import { projectRoot, recordOutput as writeOutput } from '../../command-runtime.js';
import type { TaskId, TaskMutation } from '../../../domain/task/task.js';
import { normalizeMutationResources, normalizeMutationSurfaces } from '../../../domain/work-item/concurrency.mjs';
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
    depends_on: commaSeparatedValues(optionValue(args, '--depends-on')) as TaskId[],
    ...mutationFromArgs(args)
  });

  writeYaml(context.tasksFile, context.tasks);
  writeOutput(`${context.item.id}-${taskId} created.`);
}


function mutationFromArgs(args: readonly string[]): { mutation?: TaskMutation } {
  const surfaceValue = optionValue(args, '--mutation-surfaces');
  const resourceValue = optionValue(args, '--mutation-resources');
  if (surfaceValue === undefined && resourceValue === undefined) return {};

  return {
    mutation: {
      ...(surfaceValue !== undefined
        ? { surfaces: normalizeMutationSurfaces(commaSeparatedValues(surfaceValue)) }
        : {}),
      ...(resourceValue !== undefined
        ? { resources: normalizeMutationResources(commaSeparatedValues(resourceValue)) }
        : {})
    }
  };
}
