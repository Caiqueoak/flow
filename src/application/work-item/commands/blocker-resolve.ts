import { requiredOption } from '../../../cli/command-input/arguments.js';
import { fail } from '../../../cli/terminal/output.js';
import type { LoadedWorkItem } from '../../../contracts/work-item.js';
import { editSpecMetadata } from '../work-item-context.js';

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
