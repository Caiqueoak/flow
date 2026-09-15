import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import { fail, info } from '../shared/cli-io.mjs';
import { projectRoot, valueAfter } from '../shared/project-path.mjs';
import { loadWorkItems, lifecycle } from '../artifacts/work-items.mjs';
import { parseTasks } from '../artifacts/tasks.mjs';
import { parseReview } from '../artifacts/review.mjs';
import { validateSpec } from '../artifacts/spec.mjs';
import { validateProject } from './validate.mjs';
import { evaluateGates } from './gates.mjs';
const pos = (a) => a.filter((v, i) => !v.startsWith('-') && (i === 0 || !a[i - 1].startsWith('--'))),
  list = (v) =>
    v
      ? v
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : [],
  slug = (s) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'work-item',
  write = (f, v) => fs.writeFileSync(f, stringify(v, { lineWidth: 0 }));
const find = (root, id) => {
  const x = loadWorkItems(root).find((i) => i.id === id);
  if (!x) fail(`Unknown work-item '${id}'.`);
  return x;
};
const plan = (f) => {
  const m = fs.readFileSync(f, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? parse(m[1])?.status : null;
};
function create(root, id, title, kind, priority, depends_on) {
  const base = path.join(root, '_flow', 'work-items', `${id}-${slug(title)}`);
  fs.mkdirSync(base, { recursive: true });
  const meta = {
    schema_version: 1,
    work_item: id,
    title,
    kind,
    priority,
    depends_on,
    blockers: [],
    maturity: 'outlined'
  };
  fs.writeFileSync(path.join(base, 'spec.md'), `---\n${stringify(meta).trimEnd()}\n---\n\n# Work Item Specification\n`);
  write(path.join(base, 'tasks.yaml'), { schema_version: 3, work_item: id, tasks: [] });
  fs.writeFileSync(
    path.join(base, 'implementation-plan.md'),
    `---\nschema_version: 1\nwork_item: ${id}\nstatus: draft\n---\n\n# Implementation Plan\n`
  );
  write(path.join(base, 'review.yaml'), { schema_version: 1, work_item: id, status: 'pending' });
}
function editSpec(item, fn) {
  const f = path.join(item.base, 'spec.md'),
    t = fs.readFileSync(f, 'utf8'),
    m = t.match(/^---\r?\n([\s\S]*?)\r?\n---/),
    v = parse(m[1]);
  fn(v);
  fs.writeFileSync(f, `---\n${stringify(v).trimEnd()}\n---${t.slice(m[0].length)}`);
}
export function runWorkItem({ args }) {
  const root = projectRoot(args),
    [action, target] = pos(args),
    title = valueAfter(args, '--title');
  if (action === 'create') {
    const items = loadWorkItems(root),
      id = target ?? `W${String(items.reduce((n, x) => Math.max(n, Number(x.id.slice(1))), 0) + 1).padStart(3, '0')}`;
    if (!title) fail('--title is required.');
    if (items.some((x) => x.id === id)) fail(`${id} already exists.`);
    create(
      root,
      id,
      title,
      valueAfter(args, '--kind') ?? 'feature',
      Number(valueAfter(args, '--priority') ?? 1),
      list(valueAfter(args, '--depends-on'))
    );
    return info(`${id} created.`);
  }
  const item = find(root, target);
  if (action === 'promote') {
    const r = validateSpec(fs.readFileSync(path.join(item.base, 'spec.md'), 'utf8'), { expectedWorkItem: item.id });
    if (r.errors.length) fail(`${item.id} spec is insufficient: ${r.errors.join(', ')}`);
    editSpec(item, (m) => (m.maturity = 'ready'));
  } else if (action === 'set')
    editSpec(item, (m) => {
      if (title) m.title = title;
      if (valueAfter(args, '--kind')) m.kind = valueAfter(args, '--kind');
    });
  else if (action === 'priority') editSpec(item, (m) => (m.priority = Number(valueAfter(args, '--priority'))));
  else if (action === 'dependencies') editSpec(item, (m) => (m.depends_on = list(valueAfter(args, '--depends-on'))));
  else if (action === 'blocker-add')
    editSpec(item, (m) =>
      m.blockers.push({
        id: valueAfter(args, '--id'),
        type: valueAfter(args, '--type'),
        description: valueAfter(args, '--description'),
        status: 'unresolved'
      })
    );
  else if (action === 'blocker-resolve')
    editSpec(item, (m) => {
      const b = m.blockers.find((x) => x.id === valueAfter(args, '--id'));
      if (!b) fail('Unknown blocker.');
      b.status = 'resolved';
    });
  else if (action === 'review-complete') return review(root, item, args);
  else fail(`Unknown work-item operation '${action}'.`);
  info(`${item.id} updated.`);
}
export function runTask({ args }) {
  const root = projectRoot(args),
    [action, target] = pos(args),
    item = find(root, (target ?? '').split('-T')[0]);
  if (item.maturity !== 'ready') fail(`${item.id} is outlined; promote its complete spec first.`);
  const f = path.join(item.base, 'tasks.yaml'),
    tasks = parseTasks(fs.readFileSync(f, 'utf8'), { expectedWorkItem: item.id });
  if (action === 'create') {
    const title = valueAfter(args, '--title');
    if (!title) fail('--title is required.');
    const id = `T${String(tasks.tasks.reduce((n, t) => Math.max(n, Number(t.id.slice(1))), 0) + 1).padStart(3, '0')}`;
    tasks.tasks.push({ id, title, state: 'pending', depends_on: list(valueAfter(args, '--depends-on')) });
    write(f, tasks);
    return info(`${item.id}-${id} created.`);
  }
  const local = target?.match(/T\d{3,}$/)?.[0],
    task = tasks.tasks.find((t) => t.id === local);
  if (!task) fail(`Unknown task '${target}'.`);
  if (action === 'start') {
    const all = loadWorkItems(root),
      by = new Map(all.map((x) => [x.id, x]));
    if (lifecycle(item, by).status === 'blocked') fail(`${item.id} is blocked.`);
    if (tasks.tasks.some((t) => t.state === 'in_progress')) fail('Another task is already in_progress.');
    if (!task.depends_on.every((id) => tasks.tasks.find((t) => t.id === id)?.state === 'completed'))
      fail(`${target} has incomplete dependencies.`);
    if (plan(path.join(item.base, 'implementation-plan.md')) !== 'approved')
      fail(`${item.id} requires an approved implementation plan.`);
    task.state = 'in_progress';
    write(f, tasks);
    return info(`${target} started.`);
  }
  if (action === 'set') {
    if (task.state !== 'pending') fail('Only pending tasks can be changed.');
    if (valueAfter(args, '--title')) task.title = valueAfter(args, '--title');
    if (valueAfter(args, '--depends-on') !== undefined) task.depends_on = list(valueAfter(args, '--depends-on'));
    write(f, tasks);
    return info(`${target} updated.`);
  }
  if (action === 'commit') return commit(root, item, tasks, task, target, valueAfter(args, '--message'));
  fail(`Unknown task operation '${action}'.`);
}
function commit(root, item, tasks, task, id, msg) {
  if (task.state !== 'in_progress') fail(`${id} must be in_progress.`);
  const subject = msg?.trim(),
    safe = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    re = new RegExp(
      `^(?:feat|fix|docs|style|refactor|test|build|ci|chore|perf|revert)\\([a-z0-9][a-z0-9-]*\\): .+ \\[${safe}\\]$`
    );
  if (!subject || !re.test(subject)) fail(`--message must be type(domain): description [${id}].`);
  const findings = validateProject(root, { preCommitTask: id, skipTrace: true });
  if (findings.length) fail(`Pre-commit validation failed: ${findings.map((x) => x.code).join(', ')}.`);
  const bad = evaluateGates(root, { task: id }).filter((g) => g.blocking && g.status !== 'passed');
  if (bad.length) fail(`Task gates failed: ${bad.map((g) => g.id).join(', ')}.`);
  const f = path.join(item.base, 'tasks.yaml'),
    old = fs.readFileSync(f, 'utf8');
  task.state = 'completed';
  write(f, tasks);
  try {
    execFileSync('git', ['add', '--', path.relative(root, f)], { cwd: root });
    const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean);
    if (!staged.length) fail('Task commit has no staged changes.');
    if (staged.some((x) => x.replace(/\\/g, '/').startsWith('_flow/generated/')))
      fail('Generated projections must never be committed.');
    execFileSync('git', ['commit', '-m', subject], { cwd: root, stdio: 'inherit' });
  } catch (e) {
    fs.writeFileSync(f, old);
    throw e;
  }
  info(`${id} committed.`);
}
function review(root, item, args) {
  const domain = valueAfter(args, '--domain');
  if (!domain) fail('--domain is required.');
  if (item.maturity !== 'ready' || !item.tasks.tasks.length || item.tasks.tasks.some((t) => t.state !== 'completed'))
    fail(`${item.id} is not ready for review completion.`);
  if (plan(path.join(item.base, 'implementation-plan.md')) !== 'approved')
    fail(`${item.id} requires an approved implementation plan.`);
  const findings = validateProject(root, { workItem: item.id });
  if (findings.length) fail(`Review validation failed: ${findings.map((x) => x.code).join(', ')}.`);
  const bad = evaluateGates(root, { workItem: item.id, stage: 'work-item-review' }).filter(
    (g) => g.blocking && g.status !== 'passed'
  );
  if (bad.length) fail(`Review gates failed: ${bad.map((g) => g.id).join(', ')}.`);
  const f = path.join(item.base, 'review.yaml'),
    v = parseReview(fs.readFileSync(f, 'utf8'), { expectedWorkItem: item.id });
  v.status = 'approved';
  v.reviewed_at = new Date().toISOString();
  write(f, v);
  const rel = path.relative(root, item.base).replace(/\\/g, '/');
  try {
    execFileSync('git', ['add', '--', rel], { cwd: root });
    const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean)
      .map((x) => x.replace(/\\/g, '/'));
    if (staged.some((x) => !x.startsWith(`${rel}/`) || x.startsWith('_flow/generated/')))
      fail('Review commit may contain only canonical artifacts in its work-item folder.');
    execFileSync('git', ['commit', '-m', `chore(${domain}): complete review [${item.id}]`], {
      cwd: root,
      stdio: 'inherit'
    });
  } catch (e) {
    v.status = 'pending';
    delete v.reviewed_at;
    write(f, v);
    throw e;
  }
  info(`${item.id} review completed.`);
}
export function runScope({ args }) {
  const id = pos(args)[1],
    findings = validateProject(projectRoot(args), { preCommitTask: id, skipTrace: true });
  if (findings.length) fail(findings.map((x) => `${x.code}: ${x.message}`).join(' | '));
  info(`${id} staged scope is valid.`);
}
export function runApproval() {
  fail('Use the document approval workflow.');
}
export function runBatch() {
  fail('Batch mutations are retired; use local work-item commands.');
}
