// @ts-nocheck
import { execFileSync } from 'node:child_process';
import { fail, writeOutput as info } from '../../../cli/terminal/output.js';
import { projectRoot } from '../../../cli/command-input/project-root.js';
const task = /^W\d{3,}-T\d{3,}$/,
  work = /^W\d{3,}$/;
const subject =
  /^(feat|fix|docs|style|refactor|test|build|ci|chore|perf|revert)\(([a-z0-9][a-z0-9-]*)\): (.+) \[(W\d{3,}(?:-T\d{3,})?)\]$/;
function history(root) {
  try {
    return execFileSync('git', ['log', 'HEAD', '--format=%H%x1f%ct%x1f%s%x1f%B%x1e'], { cwd: root, encoding: 'utf8' })
      .split('\x1e')
      .filter((r) => r.trim())
      .map((r) => {
        const [sha, timestamp, subject, body = ''] = r.trim().split('\x1f');
        return { sha, timestamp: Number(timestamp), subject, body };
      });
  } catch {
    fail('git history is unavailable.');
  }
}
function trailers(body) {
  const values = new Map();
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^(Flow-Work-Item|Flow-Task):\s*(\S+)\s*$/);
    if (!match) continue;
    if (values.has(match[1])) return null;
    values.set(match[1], match[2]);
  }
  return values;
}
function isCanonicalTaskCommit(entry, id) {
  const match = entry.subject.match(subject);
  if (!match || match[4] !== id) return false;
  const values = trailers(entry.body);
  return values?.get('Flow-Task') === id && values.get('Flow-Work-Item') === id.split('-')[0];
}
function changedFiles(root, sha) {
  return execFileSync('git', ['show', '--format=', '--name-only', '--no-renames', sha], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replace(/\\/g, '/'));
}
function evidence(root, entry, id) {
  const match = entry.subject.match(subject);
  return { task: id, sha: entry.sha, title: match?.[3] ?? entry.subject, files: changedFiles(root, entry.sha) };
}
function invalidEvidence(entries) {
  return entries.map((entry) => ({ sha: entry.sha, subject: entry.subject }));
}
function classify(entries, id) {
  const wanted = entries.filter((e) => e.subject.endsWith(`[${id}]`)),
    good = wanted.filter((entry) =>
      task.test(id)
        ? isCanonicalTaskCommit(entry, id)
        : (() => {
            const match = entry.subject.match(subject);
            return match && match[4] === id && match[1] === 'chore';
          })()
    ),
    invalid = wanted.filter((e) => !good.includes(e));
  return {
    status: invalid.length ? 'invalid' : !good.length ? 'missing' : good.length > 1 ? 'ambiguous' : 'resolved',
    commits: good,
    invalid_commits: invalid
  };
}
export function traceTask(root, id) {
  if (!task.test(id)) fail(`invalid qualified task ID '${id}'.`);
  const result = classify(history(root), id);
  return {
    task: id,
    status: result.status,
    commit: result.commits.length === 1 ? evidence(root, result.commits[0], id) : null,
    invalid_commits: invalidEvidence(result.invalid_commits)
  };
}
export function traceTasks(root, ids) {
  return new Map(ids.map((id) => [id, traceTask(root, id)]));
}
export function traceWorkItem(root, id) {
  if (!work.test(id)) fail(`invalid work-item ID '${id}'.`);
  const entries = history(root),
    tasks = entries.filter((entry) => {
      const match = entry.subject.match(subject);
      return match && match[4].startsWith(`${id}-T`) && isCanonicalTaskCommit(entry, match[4]);
    }),
    review = classify(entries, id);
  return {
    work_item_id: id,
    tasks: tasks.map((entry) => evidence(root, entry, entry.subject.match(subject)[4])),
    review: {
      status: review.status,
      commit: review.commits.length === 1 ? evidence(root, review.commits[0], id) : null,
      invalid_commits: invalidEvidence(review.invalid_commits)
    }
  };
}
function renderEvidence(record) {
  return `${record.task} ${record.sha} ${record.title}${record.files.length ? `\n${record.files.map((file) => `  ${file}`).join('\n')}` : ''}`;
}
export function runTrace({ args }) {
  const id = args.find((x, i) => !x.startsWith('-') && (i === 0 || !args[i - 1].startsWith('--'))),
    result = task.test(id) ? traceTask(projectRoot(args), id) : traceWorkItem(projectRoot(args), id);
  if (!id || (!task.test(id) && !work.test(id))) fail('flow trace requires W015-T003 or W015.');
  if (args.includes('--json')) return info(JSON.stringify(result, null, 2));
  if (task.test(id) && result.status !== 'resolved') fail(`${id}: ${result.status} canonical subject evidence.`);
  if (task.test(id)) return info(renderEvidence(result.commit));
  info(result.tasks.map(renderEvidence).join('\n'));
}
