import {
  BLOCKER_STATUSES,
  BLOCKER_TYPES,
  SPEC_MATURITIES,
  WORK_ITEM_KINDS
} from '../constants.js';

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
