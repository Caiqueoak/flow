import { info } from '../shared/cli-io.mjs';
import { projectRoot } from '../shared/project-path.mjs';
import { loadWorkItems, lifecycle } from '../artifacts/work-items.mjs';
export function runStatus({ args }) {
  const items = loadWorkItems(projectRoot(args)),
    by = new Map(items.map((i) => [i.id, i]));
  const value = {
    work_items: items.map((i) => ({
      id: i.id,
      title: i.title,
      status: lifecycle(i, by).status,
      task: i.tasks.tasks.find((t) => t.state === 'in_progress')?.id ?? null
    }))
  };
  info(
    args.includes('--json')
      ? JSON.stringify(value, null, 2)
      : value.work_items.map((i) => `${i.id} ${i.status} ${i.title}`).join('\n') || 'No work-items.'
  );
}
