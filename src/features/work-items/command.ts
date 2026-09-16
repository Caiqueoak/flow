import { projectRoot } from '../../shared/project-path.mjs';
import { fail, info } from '../../shared/cli-io.mjs';
import { positionalArguments } from '../../shared/cli/arguments.js';
import { createWorkItem } from './create.js';
import { promoteWorkItem } from './promote.js';
import { completeWorkItemReview } from './review-complete.js';
import { findWorkItem } from './shared.js';
import {
  addWorkItemBlocker,
  resolveWorkItemBlocker,
  updateWorkItemDependencies,
  updateWorkItemIdentity,
  updateWorkItemPriority
} from './update.js';

export function runWorkItem({ args }: { args: string[] }): void {
  const root = projectRoot(args);
  const [action, target] = positionalArguments(args);

  if (action === 'create') {
    createWorkItem(root, target, args);
    return;
  }

  const item = findWorkItem(root, target);

  switch (action) {
    case 'promote':
      promoteWorkItem(item);
      break;
    case 'set':
      updateWorkItemIdentity(item, args);
      break;
    case 'priority':
      updateWorkItemPriority(item, args);
      break;
    case 'dependencies':
      updateWorkItemDependencies(item, args);
      break;
    case 'blocker-add':
      addWorkItemBlocker(item, args);
      break;
    case 'blocker-resolve':
      resolveWorkItemBlocker(item, args);
      break;
    case 'review-complete':
      completeWorkItemReview(root, item, args);
      return;
    default:
      fail(`Unknown work-item operation '${action}'.`);
  }

  info(`${item.id} updated.`);
}
