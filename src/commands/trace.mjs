import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { info, fail } from '../shared/cli-io.mjs';
import { projectRoot } from '../shared/project-path.mjs';
import { parseBacklog } from '../artifacts/backlog.mjs';
import { parseTasks } from '../artifacts/tasks.mjs';

export function gitObjectIdFormat(root) {
  try {
    const algorithm = execFileSync('git', ['rev-parse', '--show-object-format'], {
      cwd: root,
      encoding: 'utf8'
    }).trim();
    return { algorithm, hexadecimal_length: algorithm === 'sha256' ? 64 : 40 };
  } catch {
    fail('git object format is unavailable; task traceability requires a Git repository.');
  }
}

export function traceTask(root, qualifiedTaskId) {
  if (!/^W\d{3,}-T\d{3,}$/.test(qualifiedTaskId))
    fail(`invalid qualified task ID '${qualifiedTaskId}'. Expected W015-T003.`);
  const result = traceTasks(root, [qualifiedTaskId]).get(qualifiedTaskId);
  const workItemId = qualifiedTaskId.split('-T')[0];
  const localTaskId = `T${qualifiedTaskId.split('-T')[1]}`;
  const backlogPath = path.join(root, '_flow', 'backlog.yaml');
  let artifacts = null;
  let task = null;
  let workItem = null;
  if (fs.existsSync(backlogPath)) {
    const backlog = parseBacklog(fs.readFileSync(backlogPath, 'utf8'));
    workItem = backlog.work_items.find((item) => item.id === workItemId) ?? null;
    if (workItem) {
      const base = path.join(root, '_flow', 'work-items', workItem.folder);
      const tasksPath = path.join(base, 'tasks.yaml');
      if (fs.existsSync(tasksPath))
        task =
          parseTasks(fs.readFileSync(tasksPath, 'utf8'), { expectedWorkItem: workItemId }).tasks.find(
            (candidate) => candidate.id === localTaskId
          ) ?? null;
      artifacts = {
        backlog: '_flow/backlog.yaml',
        spec: `_flow/work-items/${workItem.folder}/spec.md`,
        tasks: `_flow/work-items/${workItem.folder}/tasks.yaml`
      };
    }
  }
  if (result.status !== 'resolved') return { ...result, work_item: workItem, task_record: task, artifacts };
  const files = execFileSync('git', ['show', '--format=', '--name-only', result.commit.sha], {
    cwd: root,
    encoding: 'utf8'
  })
    .split(/\r?\n/)
    .filter(Boolean);
  const trailers = Object.fromEntries(
    [...result.commit.body.matchAll(/^(Flow-(?:Work-Item|Task)):\s*(.+)$/gm)].map((match) => [match[1], match[2]])
  );
  return {
    ...result,
    git_object_format: gitObjectIdFormat(root),
    work_item: workItem,
    task_record: task,
    persisted_sha: task?.commit_sha ?? null,
    currently_resolved_sha: result.commit.sha,
    divergence: Boolean(task?.commit_sha && task.commit_sha !== result.commit.sha),
    commit: { ...result.commit, title: result.commit.subject, trailers, files },
    artifacts
  };
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
  const task = args.find((arg, index) => !arg.startsWith('--') && (index === 0 || !args[index - 1].startsWith('--')));
  if (!task) fail('flow trace requires a qualified task ID, e.g. W015-T003.');
  const result = traceTask(projectRoot(args), task);
  if (args.includes('--json')) return info(JSON.stringify(result, null, 2));
  if (result.status === 'missing') fail(`No reachable commit declares Flow-Task: ${task}.`);
  if (result.status === 'ambiguous') fail(`Multiple reachable commits declare Flow-Task: ${task}.`);
  info(
    `${task} -> ${result.commit.sha}${result.divergence ? `\nDIVERGENCE: persisted ${result.persisted_sha}` : ''}\n${result.commit.subject}\nFiles:\n${result.commit.files.map((file) => `  ${file}`).join('\n')}\nArtifacts:\n  ${Object.values(result.artifacts ?? {}).join('\n  ')}`
  );
}
