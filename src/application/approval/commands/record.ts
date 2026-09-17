import path from 'node:path';
import { loadWorkItems } from '../../../infrastructure/persistence/work-items.mjs';
import { IMPLEMENTATION_PLAN_FILE } from '../../../domain/project/project.js';
import type { LoadedWorkItem } from '../../../domain/work-item/work-item.js';
import {
  implementationPlanRevision,
  parseImplementationPlan,
  serializeImplementationPlan
} from '../../../domain/project/implementation-plan.js';
import { readText, writeText } from '../../../infrastructure/filesystem/index.js';

export function recordApproval({ root, target, approvedAt }: { root: string; target: string; approvedAt: string }): {
  workItemId: string;
} {
  const file = path.resolve(root, target);
  const item = findWorkItemByPlan(root, file);
  const plan = parseImplementationPlan(readText(file));

  if (!plan) {
    throw new Error('implementation-plan.md requires YAML frontmatter.');
  }

  plan!.metadata.status = 'approved';
  delete plan!.metadata.approval;
  plan!.metadata.approval = {
    at: approvedAt,
    revision: implementationPlanRevision(plan!.metadata, plan!.body)
  };

  writeText(file, serializeImplementationPlan(plan!.metadata, plan!.body));
  return { workItemId: item.id };
}

function findWorkItemByPlan(root: string, planFile: string): LoadedWorkItem {
  const item = (loadWorkItems(root) as LoadedWorkItem[]).find(
    (candidate) => path.resolve(candidate.base, IMPLEMENTATION_PLAN_FILE) === planFile
  );

  if (!item) {
    throw new Error('Approvals may only record a canonical work-item implementation plan.');
  }

  return item!;
}
