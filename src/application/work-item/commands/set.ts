import { optionValue } from '../../../cli/command-input/arguments.js';
import type { LoadedWorkItem, WorkItemKind } from '../../../contracts/work-item.js';
import { editSpecMetadata } from '../work-item-context.js';

export function updateWorkItemIdentity(item: LoadedWorkItem, args: readonly string[]): void {
  const title = optionValue(args, '--title');
  const kind = optionValue(args, '--kind') as WorkItemKind | undefined;

  editSpecMetadata(item, (metadata) => {
    if (title) metadata.title = title;
    if (kind) metadata.kind = kind;
  });
}
