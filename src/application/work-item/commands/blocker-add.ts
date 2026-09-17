import { requiredOption } from '../../command-runtime.js';
import type { BlockerType, LoadedWorkItem } from '../../../domain/work-item/work-item.js';
import { editSpecMetadata } from '../work-item-context.js';

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
