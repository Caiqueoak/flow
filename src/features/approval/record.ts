import path from 'node:path';
import { loadWorkItems } from '../../artifacts/work-items.mjs';
import { fail, info } from '../../shared/cli-io.mjs';
import { optionValue, positionalArguments } from '../../shared/cli/arguments.js';
import { IMPLEMENTATION_PLAN_FILE } from '../../shared/domain/constants.js';
import type { LoadedWorkItem } from '../../shared/domain/work-item.js';
import {
  implementationPlanRevision,
  parseImplementationPlan,
  serializeImplementationPlan
} from '../../shared/documents/implementation-plan.js';
import { readText, writeText } from '../../shared/filesystem/files.js';
import { projectRoot } from '../../shared/project-path.mjs';

export function runApproval({ args }: { args: string[] }): void {
  const root = projectRoot(args);
  const [action, target] = positionalArguments(args);

  if (action !== 'record' || !target) {
    fail('Usage: flow approval record <implementation-plan.md>.');
  }

  if (path.isAbsolute(target!)) {
    fail('Approval path must be project-relative.');
  }

  const file = path.resolve(root, target!);
  const item = findWorkItemByPlan(root, file);
  const plan = parseImplementationPlan(readText(file));

  if (!plan) {
    fail('implementation-plan.md requires YAML frontmatter.');
  }

  plan!.metadata.status = 'approved';
  delete plan!.metadata.approval;
  plan!.metadata.approval = {
    at: normalizedApprovalTimestamp(args),
    revision: implementationPlanRevision(plan!.metadata, plan!.body)
  };

  writeText(file, serializeImplementationPlan(plan!.metadata, plan!.body));
  info(`${item.id} implementation plan approved.`);
}

function findWorkItemByPlan(root: string, planFile: string): LoadedWorkItem {
  const item = (loadWorkItems(root) as LoadedWorkItem[]).find(
    (candidate) => path.resolve(candidate.base, IMPLEMENTATION_PLAN_FILE) === planFile
  );

  if (!item) {
    fail('Approvals may only record a canonical work-item implementation plan.');
  }

  return item!;
}

function normalizedApprovalTimestamp(args: readonly string[]): string {
  const value = optionValue(args, '--at') ?? new Date().toISOString();

  if (Number.isNaN(Date.parse(value))) {
    fail('--at must be an ISO timestamp.');
  }

  return new Date(value).toISOString();
}
