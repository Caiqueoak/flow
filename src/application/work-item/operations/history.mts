import { lifecycle } from '../../../domain/work-item/lifecycle.js';
import type { LoadedWorkItem, WorkItemId } from '../../../domain/work-item/work-item.js';
import { loadWorkItems } from '../../../infrastructure/persistence/work-items.mjs';
import { fail } from '../../command-runtime.js';

export function assertWorkItemHistoryMutable(root: string, workItemId: string): void {
  const items = loadWorkItems(root) as LoadedWorkItem[];
  const item = items.find((candidate) => candidate.id === workItemId);
  if (!item) fail(`Unknown work-item '${workItemId}'.`);

  const byId = new Map<WorkItemId, LoadedWorkItem>(items.map((candidate) => [candidate.id, candidate]));
  if (lifecycle(item!, byId).status === 'completed') {
    fail(
      `${workItemId} is completed and its canonical history is immutable; create a new maintenance work-item for later corrections.`
    );
  }
}
