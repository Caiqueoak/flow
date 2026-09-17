import { optionValue } from '../../../presentation/cli/command-input/arguments.js';
import type { LoadedWorkItem } from '../../../domain/work-item/work-item.js';
import { editSpecMetadata } from '../work-item-context.js';

export function updateWorkItemPriority(item: LoadedWorkItem, args: readonly string[]): void {
  editSpecMetadata(item, (metadata) => {
    metadata.priority = Number(optionValue(args, '--priority'));
  });
}
