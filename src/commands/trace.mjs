import { execFileSync } from 'node:child_process';
import { info, fail } from '../shared/cli-io.mjs';
import { projectRoot } from '../shared/project-path.mjs';

export function traceTask(root, qualifiedTaskId) {
  if (!/^W\d{3,}-T\d{3,}$/.test(qualifiedTaskId)) fail(`invalid qualified task ID '${qualifiedTaskId}'. Expected W015-T003.`);
  let output;
  try {
    output = execFileSync('git', ['log', '--all', '--fixed-strings', `--grep=Flow-Task: ${qualifiedTaskId}`, '--format=%H%x1f%s%x1f%B%x1e'], { cwd: root, encoding: 'utf8' });
  } catch {
    fail('git history is unavailable; task traceability requires a Git repository.');
  }
  const trailerPattern = new RegExp(`^Flow-Task:\\s*${qualifiedTaskId}\\s*$`, 'm');
  const matches = output.split('\x1e').filter(Boolean).map((record) => {
    const [sha, subject, ...bodyParts] = record.replace(/^\n+|\n+$/g, '').split('\x1f');
    return { sha, subject, body: bodyParts.join('\x1f') };
  }).filter((entry) => trailerPattern.test(entry.body));
  if (!matches.length) return { task: qualifiedTaskId, commits: [], status: 'missing' };
  if (matches.length > 1) return { task: qualifiedTaskId, commits: matches, status: 'ambiguous' };
  return { task: qualifiedTaskId, commit: matches[0], commits: matches, status: 'resolved' };
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
