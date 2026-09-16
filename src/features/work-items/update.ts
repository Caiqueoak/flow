import { fail } from '../../shared/cli-io.mjs';
import type { BlockerType, LoadedWorkItem, WorkItemId, WorkItemKind } from '../../shared/domain/work-item.js';
import { commaSeparatedValues, optionValue, requiredOption } from '../../shared/cli/arguments.js';
import { editSpecMetadata } from './shared.js';

export function updateWorkItemIdentity(item: LoadedWorkItem, args: readonly string[]): void {
  const title = optionValue(args, '--title');
  const kind = optionValue(args, '--kind') as WorkItemKind | undefined;

  editSpecMetadata(item, (metadata) => {
    if (title) metadata.title = title;
    if (kind) metadata.kind = kind;
  });
}

export function updateWorkItemPriority(item: LoadedWorkItem, args: readonly string[]): void {
  editSpecMetadata(item, (metadata) => {
    metadata.priority = Number(optionValue(args, '--priority'));
  });
}

export function updateWorkItemDependencies(item: LoadedWorkItem, args: readonly string[]): void {
  editSpecMetadata(item, (metadata) => {
    metadata.depends_on = commaSeparatedValues(optionValue(args, '--depends-on')) as WorkItemId[];
  });
}

export function addWorkItemBlocker(item: LoadedWorkItem, args: readonly string[]): void {
  const blockerId = requiredOption(args, '--id');
  const type = requiredOption(args, '--type') as BlockerType;
  const description = requiredOption(args, '--description');

  editSpecMetadata(item, (metadata) => {
    metadata.blockers.push({
      id: blockerId,
      type,
      description,
      status: 'unresolved'
    });
  });
}

export function resolveWorkItemBlocker(item: LoadedWorkItem, args: readonly string[]): void {
  const blockerId = requiredOption(args, '--id');

  editSpecMetadata(item, (metadata) => {
    const blocker = metadata.blockers.find((candidate) => candidate.id === blockerId);

    if (!blocker) {
      fail('Unknown blocker.');
    }

    blocker!.status = 'resolved';
  });
}
