import { commaSeparatedValues, optionValue } from '../../command-runtime.js';
import type { LoadedWorkItem, WorkItemId } from '../../../domain/work-item/work-item.js';
import { editSpecMetadata } from '../work-item-context.js';

export function updateWorkItemDependencies(item: LoadedWorkItem, args: readonly string[]): void {
  editSpecMetadata(item, (metadata) => {
    metadata.depends_on = commaSeparatedValues(optionValue(args, '--depends-on')) as WorkItemId[];
  });
}
