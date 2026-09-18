import path from 'node:path';
import { loadWorkItems } from '../../../infrastructure/persistence/work-items.mjs';
import { SPEC_FILE } from '../../../domain/project/project.js';
import type { LoadedWorkItem } from '../../../domain/work-item/work-item.js';
import {
  parseWorkItemSpec,
  serializeWorkItemSpec,
  specificationRevision
} from '../../../domain/work-item/specification.mjs';
import { readText, writeText } from '../../../infrastructure/filesystem/index.js';

export function recordApproval({ root, target, approvedAt }: { root: string; target: string; approvedAt: string }): {
  workItemId: string;
} {
  const file = path.resolve(root, target);
  const item = findWorkItemBySpec(root, file);
  const spec = parseWorkItemSpec(readText(file), { expectedWorkItem: item.id });
  spec.metadata.approval = {
    at: approvedAt,
    revision: specificationRevision(spec.metadata, spec.body)
  };
  writeText(file, serializeWorkItemSpec(spec.metadata, spec.body));
  return { workItemId: item.id };
}

function findWorkItemBySpec(root: string, specFile: string): LoadedWorkItem {
  const item = (loadWorkItems(root) as LoadedWorkItem[]).find(
    (candidate) => path.resolve(candidate.base, SPEC_FILE) === specFile
  );

  if (!item) {
    throw new Error('Approvals may only record a canonical work-item spec.');
  }

  return item!;
}
