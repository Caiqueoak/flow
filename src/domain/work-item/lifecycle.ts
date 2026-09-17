import type { LoadedWorkItem, WorkItemId } from './work-item.js';

export type WorkItemLifecycleStatus = 'outlined' | 'blocked' | 'in_progress' | 'review' | 'completed' | 'eligible';

export interface WorkItemLifecycle {
  status: WorkItemLifecycleStatus;
  reasons: Array<{ type: 'dependency' | 'blocker'; ref: string }>;
}

export function lifecycle(item: LoadedWorkItem, byId: ReadonlyMap<WorkItemId, LoadedWorkItem>): WorkItemLifecycle {
  if (item.maturity === 'outlined') return { status: 'outlined', reasons: [] };
  const incomplete = item.depends_on.filter((id) => {
    const dependency = byId.get(id);
    return !dependency || lifecycle(dependency, byId).status !== 'completed';
  });
  const blockers = item.blockers.filter((blocker) => blocker.status === 'unresolved');
  if (incomplete.length || blockers.length) {
    return {
      status: 'blocked',
      reasons: [
        ...incomplete.map((ref) => ({ type: 'dependency' as const, ref })),
        ...blockers.map((blocker) => ({ type: 'blocker' as const, ref: blocker.id }))
      ]
    };
  }
  if (item.tasks.tasks.some((task) => task.state === 'in_progress')) return { status: 'in_progress', reasons: [] };
  if (item.tasks.tasks.length && item.tasks.tasks.every((task) => task.state === 'completed')) {
    return { status: item.review.status === 'approved' ? 'completed' : 'review', reasons: [] };
  }
  return { status: 'eligible', reasons: [] };
}
