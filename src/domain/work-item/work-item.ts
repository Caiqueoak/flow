import type { TaskCollection } from '../task/task.js';

export const BACKLOG_SCHEMA_VERSION = 4;
export const REVIEW_SCHEMA_VERSION = 1;
export const WORK_ITEM_ID_PREFIX = 'W';
export const WORK_ITEM_ID_PATTERN = '^W\\d{3,}$';
export const WORK_ITEM_ID = new RegExp(WORK_ITEM_ID_PATTERN);
export const DEFAULT_WORK_ITEM_KIND = 'feature';
export const DEFAULT_WORK_ITEM_PRIORITY = 1;

export const DERIVED_WORK_ITEM_STATES = [
  'outlined',
  'blocked',
  'eligible',
  'in_progress',
  'review',
  'completed'
] as const;
export const SPEC_MATURITIES = ['outlined', 'ready'] as const;
export const WORK_ITEM_KINDS = ['feature', 'technical', 'maintenance'] as const;
export const BLOCKER_TYPES = ['external_action', 'consequential_decision'] as const;
export const BLOCKER_STATUSES = ['unresolved', 'resolved'] as const;

export type WorkItemId = `W${number}`;
export type WorkItemKind = (typeof WORK_ITEM_KINDS)[number];
export type SpecMaturity = (typeof SPEC_MATURITIES)[number];
export type BlockerType = (typeof BLOCKER_TYPES)[number];
export type BlockerStatus = (typeof BLOCKER_STATUSES)[number];

export interface Blocker {
  id: string;
  type: BlockerType;
  description: string;
  status: BlockerStatus;
}

export interface WorkItemSpecMetadata {
  schema_version: number;
  work_item: WorkItemId;
  title: string;
  kind: WorkItemKind;
  priority: number;
  depends_on: WorkItemId[];
  blockers: Blocker[];
  maturity: SpecMaturity;
}

export interface WorkItemReview {
  status: 'pending' | 'approved';
  reviewed_at?: string;
}

export interface LoadedWorkItem extends WorkItemSpecMetadata {
  id: WorkItemId;
  folder: string;
  base: string;
  specBody: string;
  tasks: TaskCollection;
  review: WorkItemReview;
}
