import { projectRoot, recordOutput as writeOutput } from '../../command-runtime.js';
import type { LoadedWorkItem, WorkItemId } from '../../../domain/work-item/work-item.js';
import { loadWorkItems } from '../../../infrastructure/persistence/work-items.mjs';
import { lifecycle } from '../../../domain/work-item/lifecycle.js';

interface StatusCommandContext {
  args: string[];
}

interface WorkItemLifecycle {
  status: string;
}

type LoadWorkItems = (root: string) => LoadedWorkItem[];
type DeriveLifecycle = (item: LoadedWorkItem, workItemsById: Map<WorkItemId, LoadedWorkItem>) => WorkItemLifecycle;

const loadWorkItemsBoundary = loadWorkItems as LoadWorkItems;
const deriveLifecycleBoundary = lifecycle as DeriveLifecycle;

export function runStatus({ args }: StatusCommandContext): void {
  const items = loadWorkItemsBoundary(projectRoot(args));
  const workItemsById = new Map(items.map((item) => [item.id, item]));
  const status = {
    work_items: items.map((item) => ({
      id: item.id,
      title: item.title,
      status: deriveLifecycleBoundary(item, workItemsById).status,
      task: item.tasks.tasks.find((task) => task.state === 'in_progress')?.id ?? null
    }))
  };

  writeOutput(args.includes('--json') ? JSON.stringify(status, null, 2) : formatStatus(status.work_items));
}

function formatStatus(
  workItems: Array<{ id: WorkItemId; status: string; title: string; task: string | null }>
): string {
  return workItems.map((item) => `${item.id} ${item.status} ${item.title}`).join('\n') || 'No work-items.';
}
