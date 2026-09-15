import { execFileSync } from 'node:child_process';
import { info, fail } from '../shared/cli-io.mjs';
import { projectRoot } from '../shared/project-path.mjs';
const task = /^W\d{3,}-T\d{3,}$/,
  work = /^W\d{3,}$/;
const subject =
  /^(feat|fix|docs|style|refactor|test|build|ci|chore|perf|revert)\(([a-z0-9][a-z0-9-]*)\): (.+) \[(W\d{3,}(?:-T\d{3,})?)\]$/;
function history(root) {
  try {
    return execFileSync('git', ['log', 'HEAD', '--format=%H%x1f%ct%x1f%s%x1e'], { cwd: root, encoding: 'utf8' })
      .split('\x1e')
      .filter((r) => r.trim())
      .map((r) => {
        const [sha, timestamp, ...rest] = r.trim().split('\x1f');
        return { sha, timestamp: Number(timestamp), subject: rest.join('\x1f') };
      });
  } catch {
    fail('git history is unavailable.');
  }
}
function classify(entries, id) {
  const wanted = entries.filter((e) => e.subject.endsWith(`[${id}]`)),
    good = wanted.filter((e) => {
      const m = e.subject.match(subject);
      return m && m[4] === id && (task.test(id) ? m[1] !== 'chore' || true : m[1] === 'chore');
    }),
    invalid = wanted.filter((e) => !good.includes(e));
  return {
    status: invalid.length ? 'invalid' : !good.length ? 'missing' : good.length > 1 ? 'ambiguous' : 'resolved',
    commits: good,
    invalid_commits: invalid
  };
}
export function traceTask(root, id) {
  if (!task.test(id)) fail(`invalid qualified task ID '${id}'.`);
  return { task: id, ...classify(history(root), id) };
}
export function traceTasks(root, ids) {
  return new Map(ids.map((id) => [id, traceTask(root, id)]));
}
export function traceWorkItem(root, id) {
  if (!work.test(id)) fail(`invalid work-item ID '${id}'.`);
  const entries = history(root),
    tasks = entries.filter((e) => {
      const m = e.subject.match(subject);
      return m && m[4].startsWith(`${id}-T`);
    }),
    review = classify(entries, id);
  return { work_item_id: id, commits: [...tasks, ...review.commits], review, invalid_commits: review.invalid_commits };
}
export function runTrace({ args }) {
  const id = args.find((x, i) => !x.startsWith('-') && (i === 0 || !args[i - 1].startsWith('--'))),
    result = task.test(id) ? traceTask(projectRoot(args), id) : traceWorkItem(projectRoot(args), id);
  if (!id || (!task.test(id) && !work.test(id))) fail('flow trace requires W015-T003 or W015.');
  if (args.includes('--json')) return info(JSON.stringify(result, null, 2));
  if (task.test(id) && result.status !== 'resolved') fail(`${id}: ${result.status} canonical subject evidence.`);
  info(result.commits.map((c) => `${c.sha} ${c.subject}`).join('\n'));
}
