import { fail, projectRoot, recordOutput as info } from '../../command-runtime.js';
import { gitChangedFiles, gitHistory } from '../../../infrastructure/git/index.js';
const task = /^W\d{3,}-T\d{3,}$/,
  work = /^W\d{3,}$/;
const subject =
  /^(feat|fix|docs|style|refactor|test|build|ci|chore|perf|revert)\(([a-z0-9][a-z0-9-]*)\): (.+) \[(W\d{3,}(?:-T\d{3,})?)\]$/;

interface HistoryEntry {
  sha: string;
  timestamp: number;
  subject: string;
  body: string;
}

interface Evidence {
  task: string;
  sha: string;
  title: string;
  files: string[];
}

interface Classification {
  status: 'invalid' | 'missing' | 'ambiguous' | 'resolved';
  commits: HistoryEntry[];
  invalid_commits: HistoryEntry[];
}

function history(root: string): HistoryEntry[] {
  try {
    return gitHistory(root)
      .split('\x1e')
      .filter((record) => record.trim())
      .map((record) => {
        const [sha = '', timestamp = '0', commitSubject = '', body = ''] = record.trim().split('\x1f');
        return { sha, timestamp: Number(timestamp), subject: commitSubject, body };
      });
  } catch {
    fail('git history is unavailable.');
  }
}
function trailers(body: string): Map<string, string> | null {
  const values = new Map<string, string>();
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^(Flow-Work-Item|Flow-Task):\s*(\S+)\s*$/);
    if (!match) continue;
    const key = match[1]!;
    if (values.has(key)) return null;
    values.set(key, match[2]!);
  }
  return values;
}
function isCanonicalTaskCommit(entry: HistoryEntry, id: string): boolean {
  const match = entry.subject.match(subject);
  if (!match || match[4] !== id) return false;
  const values = trailers(entry.body);
  return values?.get('Flow-Task') === id && values?.get('Flow-Work-Item') === id.split('-')[0];
}
function changedFiles(root: string, sha: string): string[] {
  return gitChangedFiles(root, sha);
}
function evidence(root: string, entry: HistoryEntry, id: string): Evidence {
  const match = entry.subject.match(subject);
  return { task: id, sha: entry.sha, title: match?.[3] ?? entry.subject, files: changedFiles(root, entry.sha) };
}
function invalidEvidence(entries: readonly HistoryEntry[]): Array<{ sha: string; subject: string }> {
  return entries.map((entry) => ({ sha: entry.sha, subject: entry.subject }));
}
function classify(entries: readonly HistoryEntry[], id: string): Classification {
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
export function traceTask(root: string, id: string) {
  if (!task.test(id)) fail(`invalid qualified task ID '${id}'.`);
  const result = classify(history(root), id);
  return {
    task: id,
    status: result.status,
    commit: result.commits.length === 1 ? evidence(root, result.commits[0]!, id) : null,
    invalid_commits: invalidEvidence(result.invalid_commits)
  };
}
export function traceTasks(root: string, ids: readonly string[]) {
  return new Map(ids.map((id) => [id, traceTask(root, id)]));
}
export function traceWorkItem(root: string, id: string) {
  if (!work.test(id)) fail(`invalid work-item ID '${id}'.`);
  const entries = history(root),
    tasks = entries.filter((entry) => {
      const match = entry.subject.match(subject);
      return Boolean(match?.[4]?.startsWith(`${id}-T`) && isCanonicalTaskCommit(entry, match[4]));
    }),
    review = classify(entries, id);
  return {
    work_item_id: id,
    tasks: tasks.map((entry) => evidence(root, entry, entry.subject.match(subject)![4]!)),
    review: {
      status: review.status,
      commit: review.commits.length === 1 ? evidence(root, review.commits[0]!, id) : null,
      invalid_commits: invalidEvidence(review.invalid_commits)
    }
  };
}
function renderEvidence(record: Evidence): string {
  return `${record.task} ${record.sha} ${record.title}${record.files.length ? `\n${record.files.map((file) => `  ${file}`).join('\n')}` : ''}`;
}
export function runTrace({ args }: { args: string[] }): void {
  const id = args.find((value, index) => !value.startsWith('-') && (index === 0 || !args[index - 1]?.startsWith('--')));
  if (!id || (!task.test(id) && !work.test(id))) fail('flow trace requires W015-T003 or W015.');
  const root = projectRoot(args);
  if (task.test(id)) {
    const taskResult = traceTask(root, id);
    if (args.includes('--json')) return info(JSON.stringify(taskResult, null, 2));
    if (taskResult.status !== 'resolved' || !taskResult.commit)
      fail(`${id}: ${taskResult.status} canonical subject evidence.`);
    return info(renderEvidence(taskResult.commit));
  }
  const workItemResult = traceWorkItem(root, id);
  if (args.includes('--json')) return info(JSON.stringify(workItemResult, null, 2));
  info(workItemResult.tasks.map(renderEvidence).join('\n'));
}
