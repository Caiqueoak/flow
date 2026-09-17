import { BACKLOG_SCHEMA_VERSION, type LoadedWorkItem, type WorkItemId } from '../../domain/work-item/work-item.js';
import { lifecycle, type WorkItemLifecycleStatus } from '../../domain/work-item/lifecycle.js';
import { topologicalOrder } from '../../domain/work-item/backlog.mjs';

export interface DerivedBacklog {
  schema_version: number;
  work_items: Array<{
    id: WorkItemId;
    folder: string;
    title: string;
    kind: LoadedWorkItem['kind'];
    priority: number;
    spec_maturity: LoadedWorkItem['maturity'];
    depends_on: WorkItemId[];
    blockers: LoadedWorkItem['blockers'];
    state: WorkItemLifecycleStatus;
  }>;
}

export function derivedBacklog(items: readonly LoadedWorkItem[]): DerivedBacklog {
  const byId = new Map(items.map((item) => [item.id, item]));
  return {
    schema_version: BACKLOG_SCHEMA_VERSION,
    work_items: topologicalOrder(items).map((item) => ({
      id: item.id,
      folder: item.folder,
      title: item.title,
      kind: item.kind,
      priority: item.priority,
      spec_maturity: item.maturity,
      depends_on: item.depends_on,
      blockers: item.blockers,
      state: lifecycle(item, byId).status
    }))
  };
}
