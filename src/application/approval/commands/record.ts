import path from 'node:path';
import {
  assertProjectContractsAuthorized,
  canonicalProjectDocumentKind,
  validateProjectDocument
} from '../../project-contracts.mjs';
import { clearCheckpoint } from '../../checkpoint/operations/checkpoint.mjs';
import { UserInputError } from '../../../domain/errors.js';
import { loadExecutionState } from '../../../infrastructure/persistence/execution-state.mjs';
import { loadWorkItems } from '../../../infrastructure/persistence/work-items.mjs';
import { SPEC_FILE } from '../../../domain/project/project.js';
import type { LoadedWorkItem } from '../../../domain/work-item/work-item.js';
import { approveProjectDocument, documentRevision } from '../../../domain/project/document.mjs';
import {
  parseWorkItemSpec,
  serializeWorkItemSpec,
  specificationRevision
} from '../../../domain/work-item/specification.mjs';
import { readText, writeText } from '../../../infrastructure/filesystem/index.js';

export interface ApprovalResult {
  label: string;
  revision: string;
}

export function recordApproval({
  root,
  target,
  approvedAt
}: {
  root: string;
  target: string;
  approvedAt: string;
}): ApprovalResult {
  const kind = canonicalProjectDocumentKind(target);
  if (kind) return recordProjectDocumentApproval(root, target, kind, approvedAt);

  assertProjectContractsAuthorized(root);
  const file = path.resolve(root, target);
  const item = findWorkItemBySpec(root, file);
  const spec = parseWorkItemSpec(readText(file), { expectedWorkItem: item.id });
  const revision = specificationRevision(spec.metadata, spec.body);
  const targetRef = normalizeTargetRef(target);
  assertApprovalReadyRevision(root, targetRef, revision);

  spec.metadata.approval = { at: approvedAt, revision };
  writeText(file, serializeWorkItemSpec(spec.metadata, spec.body));
  clearMatchingCheckpoint(root, targetRef, revision);
  return { label: `${item.id} specification`, revision };
}

function recordProjectDocumentApproval(
  root: string,
  target: string,
  kind: NonNullable<ReturnType<typeof canonicalProjectDocumentKind>>,
  approvedAt: string
): ApprovalResult {
  const file = path.resolve(root, target);
  const current = readText(file);
  const errors = validateProjectDocument(kind, current);
  if (errors.length) throw new Error(`Cannot approve ${target}: ${errors.join(' ')}`);

  const targetRef = normalizeTargetRef(target);
  const revision = documentRevision(current);
  assertApprovalReadyRevision(root, targetRef, revision);

  const approved = approveProjectDocument(current, approvedAt);
  const approvedErrors = validateProjectDocument(kind, approved.text);
  if (approvedErrors.length) {
    throw new Error(`Cannot approve ${target} under the current project-document schema: ${approvedErrors.join(' ')}`);
  }

  writeText(file, approved.text);
  clearMatchingCheckpoint(root, targetRef, approved.revision);
  return { label: targetRef, revision: approved.revision };
}

function assertApprovalReadyRevision(root: string, targetRef: string, targetRevision: string): void {
  const checkpoint = loadExecutionState(root).checkpoint;
  if (checkpoint?.status !== 'approval_ready' || normalizeTargetRef(checkpoint.target.ref) !== targetRef) {
    return;
  }

  if (checkpoint.target.revision !== targetRevision) {
    throw new UserInputError(
      `Cannot approve ${targetRef}: current revision ${targetRevision} does not match approval-ready checkpoint revision ${checkpoint.target.revision}.`
    );
  }
}

function clearMatchingCheckpoint(root: string, targetRef: string, targetRevision: string): void {
  const checkpoint = loadExecutionState(root).checkpoint;
  if (
    checkpoint?.status !== 'approval_ready' ||
    normalizeTargetRef(checkpoint.target.ref) !== targetRef ||
    checkpoint.target.revision !== targetRevision
  ) {
    return;
  }

  clearCheckpoint(root, { targetRef: checkpoint.target.ref, targetRevision });
}

function normalizeTargetRef(target: string): string {
  return target.replaceAll('\\', '/').replace(/^\.\//, '');
}

function findWorkItemBySpec(root: string, specFile: string): LoadedWorkItem {
  const item = (loadWorkItems(root) as LoadedWorkItem[]).find(
    (candidate) => path.resolve(candidate.base, SPEC_FILE) === specFile
  );

  if (!item) throw new Error('Approvals may only record a canonical project document or work-item spec.');
  return item;
}
