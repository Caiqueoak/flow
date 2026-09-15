import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { info, fail } from '../shared/cli-io.mjs';
import { projectRoot } from '../shared/project-path.mjs';
import { parseBacklog } from '../artifacts/backlog.mjs';
import { parseTasks } from '../artifacts/tasks.mjs';

const WORK_ITEM = /^W\d{3,}$/;
const TASK = /^W\d{3,}-T\d{3,}$/;
function history(root) {
  let output;
  try { output = execFileSync('git', ['log', 'HEAD', '--format=%H%x1f%ct%x1f%s%x1f%B%x1e'], { cwd: root, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }); }
  catch { fail('git history is unavailable; task traceability requires a Git repository.'); }
  return output.split('\x1e').filter(Boolean).map((record) => {
    const [sha, timestamp, subject, ...body] = record.replace(/^\n+|\n+$/g, '').split('\x1f');
    const text = body.join('\x1f');
    return { sha, timestamp: Number(timestamp), subject, body: text,
      work: [...text.matchAll(/^Flow-Work-Item:\s*(.*?)\s*$/gm)].map((m) => m[1]),
      task: [...text.matchAll(/^Flow-Task:\s*(.*?)\s*$/gm)].map((m) => m[1]) };
  });
}
function files(root, sha) { return execFileSync('git', ['show', '--format=', '--name-only', sha], { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean).sort(); }
function valid(entry) { return entry.work.length === 1 && entry.task.length === 1 && WORK_ITEM.test(entry.work[0]) && TASK.test(entry.task[0]) && entry.task[0].split('-T')[0] === entry.work[0]; }
function context(root, id) {
  const backlogPath = path.join(root, '_flow', 'backlog.yaml');
  if (!fs.existsSync(backlogPath)) return { work_item: null, artifacts: null };
  const work_item = parseBacklog(fs.readFileSync(backlogPath, 'utf8')).work_items.find((item) => item.id === id) ?? null;
  return !work_item ? { work_item, artifacts: null } : { work_item, artifacts: { backlog: '_flow/backlog.yaml', spec: `_flow/work-items/${work_item.folder}/spec.md`, tasks: `_flow/work-items/${work_item.folder}/tasks.yaml` } };
}
export function traceTasks(root, ids) {
  for (const id of ids) if (!TASK.test(id)) fail(`invalid qualified task ID '${id}'. Expected W015-T003.`);
  const entries = history(root);
  return new Map(ids.map((id) => {
    const commits = entries.filter((entry) => valid(entry) && entry.task[0] === id);
    const invalid_commits = entries.filter((entry) => entry.task.includes(id) && !valid(entry));
    const status = invalid_commits.length ? 'invalid' : !commits.length ? 'missing' : commits.length > 1 ? 'ambiguous' : 'resolved';
    return [id, { task: id, commits, invalid_commits, status, ...(status === 'resolved' ? { commit: commits[0] } : {}) }];
  }));
}
export function traceTask(root, id) {
  const result = traceTasks(root, [id]).get(id); const workId = id.split('-T')[0]; const data = context(root, workId);
  let task_record = null;
  if (data.artifacts && fs.existsSync(path.join(root, data.artifacts.tasks))) task_record = parseTasks(fs.readFileSync(path.join(root, data.artifacts.tasks), 'utf8'), { expectedWorkItem: workId }).tasks.find((task) => task.id === `T${id.split('-T')[1]}`) ?? null;
  if (result.commit) result.commit = { ...result.commit, files: files(root, result.commit.sha), trailers: { 'Flow-Work-Item': workId, 'Flow-Task': id } };
  return { ...result, ...data, task_record };
}
export function traceWorkItem(root, id) {
  if (!WORK_ITEM.test(id)) fail(`invalid work-item ID '${id}'. Expected W015.`);
  const entries = history(root);
  const commits = entries.filter((entry) => valid(entry) && entry.work[0] === id).map((entry) => ({ ...entry, task: entry.task[0], files: files(root, entry.sha) })).sort((a, b) => b.timestamp - a.timestamp || a.sha.localeCompare(b.sha));
  const invalid_commits = entries.filter((entry) => entry.work.includes(id) && !valid(entry));
  return { work_item_id: id, commits, invalid_commits, ...context(root, id) };
}
export function gitObjectIdFormat(root) { const algorithm = execFileSync('git', ['rev-parse', '--show-object-format'], { cwd: root, encoding: 'utf8' }).trim(); return { algorithm, hexadecimal_length: algorithm === 'sha256' ? 64 : 40 }; }
export function runTrace({ args }) {
  const id = args.find((arg, index) => !arg.startsWith('--') && (index === 0 || !args[index - 1].startsWith('--')));
  if (!id) fail('flow trace requires W015-T003 or W015.'); const root = projectRoot(args); const result = TASK.test(id) ? traceTask(root, id) : traceWorkItem(root, id);
  if (args.includes('--json')) return info(JSON.stringify(result, null, 2));
  if (TASK.test(id)) { if (result.status !== 'resolved') fail(`${id}: ${result.status} Flow trailer evidence.`); return info(`${id} -> ${result.commit.sha}\n${result.commit.subject}\nFiles:\n${result.commit.files.map((file) => `  ${file}`).join('\n')}`); }
  const listing = result.commits.map((entry) => `${entry.task} ${entry.sha} ${entry.subject}\n${entry.files.map((file) => `  ${file}`).join('\n')}`).join('\n');
  const invalid = result.invalid_commits.length ? `\nINVALID FLOW TRAILERS: ${result.invalid_commits.map((entry) => entry.sha).join(', ')}` : '';
  info(`${listing}${invalid}`.trim());
}
