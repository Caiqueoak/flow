export type LifecycleState = 'pending' | 'in_progress' | 'completed';
export type SpecMaturity = 'outlined' | 'ready';
export type TaskProvenance = 'legacy_migration';
export type WorkflowPhase =
  | 'discovery'
  | 'prd'
  | 'engineering'
  | 'backlog'
  | 'specification'
  | 'planning'
  | 'implementation'
  | 'review'
  | 'reconcile'
  | 'complete';

export interface Blocker {
  id: string;
  type: 'external_action' | 'consequential_decision';
  description: string;
  status: 'unresolved' | 'resolved';
}

export interface WorkItem {
  id: `W${number}`;
  folder: string;
  kind: 'feature' | 'technical' | 'maintenance';
  title: string;
  state: LifecycleState;
  priority: number;
  spec_maturity: SpecMaturity;
  depends_on: Array<`W${number}`>;
  blockers: Blocker[];
}

export interface Task {
  id: `T${number}`;
  title: string;
  state: LifecycleState;
  depends_on: Array<`T${number}`>;
  provenance?: TaskProvenance;
  legacy_commit?: string;
}

export interface ExecutionCursor {
  schema_version: number;
  execution: { phase: WorkflowPhase; step: string };
  active: { work_item: `W${number}` | null; task: `W${number}-T${number}` | null };
  stop_reason: string | null;
  migration: { status: 'not_required' | 'pending_reconciliation' | 'completed' };
}
