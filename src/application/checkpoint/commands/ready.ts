import path from 'node:path';
import { optionValue, recordOutput } from '../../command-runtime.js';
import { UserInputError } from '../../../domain/errors.js';
import { documentRevision } from '../../../domain/project/document.mjs';
import { canonicalProjectDocumentKind } from '../../project-contracts.mjs';
import { parseWorkItemSpec, specificationRevision } from '../../../domain/work-item/specification.mjs';
import { readText } from '../../../infrastructure/filesystem/index.js';
import { loadExecutionState } from '../../../infrastructure/persistence/execution-state.mjs';
import { markCheckpointApprovalReady } from '../operations/checkpoint.mjs';

export function runReady(root: string, args: readonly string[]): void {
  const revision = optionValue(args, '--target-revision') ?? currentTargetRevision(root);
  markCheckpointApprovalReady(root, revision);
  recordOutput('Checkpoint is approval-ready.');
}

function currentTargetRevision(root: string): string {
  const checkpoint = loadExecutionState(root).checkpoint;
  if (!checkpoint) throw new UserInputError('No active checkpoint exists.');

  const targetRef = checkpoint.target.ref;
  const text = readText(path.resolve(root, targetRef));
  if (canonicalProjectDocumentKind(targetRef)) return documentRevision(text);

  if (targetRef.endsWith('/spec.md') || targetRef === 'spec.md') {
    const spec = parseWorkItemSpec(text);
    return specificationRevision(spec.metadata, spec.body);
  }

  throw new UserInputError('Checkpoint ready requires --target-revision for this target kind.');
}
