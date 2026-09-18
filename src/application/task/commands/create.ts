import { commaSeparatedValues, optionValue, requiredOption } from '../../command-runtime.js';
import { projectRoot, recordOutput as writeOutput } from '../../command-runtime.js';
import type { TaskId } from '../../../domain/task/task.js';
import { writeYaml } from '../../../infrastructure/filesystem/index.js';
import { readText, writeText } from '../../../infrastructure/filesystem/index.js';
import { loadTaskContext, nextTaskId } from '../task-context.js';
import { documentRevision } from '../../../domain/project/document.mjs';
import { parseImplementationPlan, serializeImplementationPlan } from '../../../domain/project/implementation-plan.js';
import path from 'node:path';

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
  refreshBriefTaskRevision(projectRoot(args), context.item.base, context.tasksFile);
  writeOutput(`${context.item.id}-${taskId} created.`);
}

function refreshBriefTaskRevision(root: string, base: string, tasksFile: string): void {
  const file = path.join(base, 'implementation-plan.md');
  const brief = parseImplementationPlan(readText(file));
  if (!brief || brief.metadata.schema_version !== 2) return;
  brief.metadata.tasks_revision = documentRevision(readText(tasksFile));
  writeText(file, serializeImplementationPlan(brief.metadata, brief.body));
}
