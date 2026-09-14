import { execFileSync } from 'node:child_process';
import { info, fail } from '../shared/cli-io.mjs';
import { projectRoot } from '../shared/project-path.mjs';

export function traceTask(root, qualifiedTaskId) {
  if (!/^W\d{3,}-T\d{3,}$/.test(qualifiedTaskId))
    fail(`invalid qualified task ID '${qualifiedTaskId}'. Expected W015-T003.`);
  return traceTasks(root, [qualifiedTaskId]).get(qualifiedTaskId);
}

export function traceTasks(root, qualifiedTaskIds) {
  for (const qualifiedTaskId of qualifiedTaskIds)
    if (!/^W\d{3,}-T\d{3,}$/.test(qualifiedTaskId))
      fail(`invalid qualified task ID '${qualifiedTaskId}'. Expected W015-T003.`);
  const requested = new Set(qualifiedTaskIds);
  const matches = new Map([...requested].map((task) => [task, []]));
  let output;
  try {
    output = execFileSync('git', ['log', 'HEAD', '--format=%H%x1f%s%x1f%B%x1e'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024
    });
  } catch {
    fail('git history is unavailable; task traceability requires a Git repository.');
  }
  for (const entry of output
    .split('\x1e')
    .filter(Boolean)
    .map((record) => {
      const [sha, subject, ...bodyParts] = record.replace(/^\n+|\n+$/g, '').split('\x1f');
      return { sha, subject, body: bodyParts.join('\x1f') };
    })) {
    const workItems = new Set([...entry.body.matchAll(/^Flow-Work-Item:\s*(W\d{3,})\s*$/gm)].map((match) => match[1]));
    for (const match of entry.body.matchAll(/^Flow-Task:\s*(W\d{3,}-T\d{3,})\s*$/gm)) {
      const task = match[1];
      if (requested.has(task) && workItems.has(task.split('-')[0])) matches.get(task).push(entry);
    }
  }
  return new Map(
    [...requested].map((task) => {
      const commits = matches.get(task);
      if (!commits.length) return [task, { task, commits, status: 'missing' }];
      if (commits.length > 1) return [task, { task, commits, status: 'ambiguous' }];
      return [task, { task, commit: commits[0], commits, status: 'resolved' }];
    })
  );
}

export function runTrace({ args }) {
  const task = args.find((arg) => !arg.startsWith('--'));
  if (!task) fail('flow trace requires a qualified task ID, e.g. W015-T003.');
  const result = traceTask(projectRoot(args), task);
  if (args.includes('--json')) return info(JSON.stringify(result, null, 2));
  if (result.status === 'missing') fail(`No reachable commit declares Flow-Task: ${task}.`);
  if (result.status === 'ambiguous') fail(`Multiple reachable commits declare Flow-Task: ${task}.`);
  info(`${task} -> ${result.commit.sha}\n${result.commit.subject}`);
}
