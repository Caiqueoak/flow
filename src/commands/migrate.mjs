import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { info } from '../shared/cli-io.mjs';
import { projectRoot } from '../shared/project-path.mjs';
import { emptyState, stringifyState } from '../artifacts/state.mjs';
import { parseBacklog } from '../artifacts/backlog.mjs';
import { parseTasks } from '../artifacts/tasks.mjs';
import { generateGraphMarkdown } from './graph.mjs';
import { readConfig, writeConfig, defaultConfig } from '../shared/project-config.mjs';

const STATES = {
  done: 'completed',
  complete: 'completed',
  completed: 'completed',
  in_progress: 'in_progress',
  blocked: 'pending',
  pending: 'pending',
  todo: 'pending'
};
function lifecycle(value) {
  if (!STATES[value]) throw new Error(`Unknown legacy state '${value}'.`);
  return STATES[value];
}
function number(value) {
  const match = String(value).match(/\d+/);
  if (!match) throw new Error(`Cannot normalize ID '${value}'.`);
  return match[0].padStart(3, '0');
}
function move(from, to) {
  if (!fs.existsSync(from)) return;
  if (fs.existsSync(to)) throw new Error(`Migration destination already exists: ${to}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
}
function normalizeTasks(file, item) {
  const raw = parse(fs.readFileSync(file, 'utf8'));
  const mapping = new Map();
  const ids = new Set();
  for (const task of raw.tasks ?? []) {
    const match = String(task.id).match(/^(?:([A-Z]\d+)-)?T(\d+)$/);
    if (!match || (match[1] && number(match[1]) !== item.id.slice(1)))
      throw new Error(`Invalid/cross-work-item task ID '${task.id}'.`);
    const id = `T${match[2].padStart(3, '0')}`;
    if (ids.has(id)) throw new Error(`Task ID collision: ${id}`);
    ids.add(id);
    mapping.set(task.id, id);
  }
  const tasks = (raw.tasks ?? []).map((task) => {
    const state = lifecycle(task.state ?? task.status ?? 'pending');
    const result = {
      ...task,
      id: mapping.get(task.id),
      state,
      depends_on: (task.depends_on ?? []).map((dep) => {
        if (!mapping.has(dep)) throw new Error(`Unknown task dependency '${dep}'.`);
        return mapping.get(dep);
      }),
      implementation: state === 'completed' ? 'legacy' : task.implementation === 'none' ? 'none' : 'commit'
    };
    if (task.commit) result.legacy_commit = task.commit;
    delete result.commit;
    delete result.status;
    delete result.execution_id;
    return result;
  });
  const text = stringify({ schema_version: 1, work_item: item.id, tasks }, { lineWidth: 0 });
  parseTasks(text, { expectedWorkItem: item.id });
  fs.writeFileSync(file, text);
}
function migrateStaged(root) {
  const flow = path.join(root, '.flow');
  const oldConfig = readConfig(root);
  const oldFile = path.join(flow, fs.existsSync(path.join(flow, 'BACKLOG.yaml')) ? 'BACKLOG.yaml' : 'backlog.yaml');
  const raw = parse(fs.readFileSync(oldFile, 'utf8'));
  const mapping = new Map();
  const ids = new Set();
  for (const item of raw.work_items ?? []) {
    const id = `W${number(item.id)}`;
    if (ids.has(id)) throw new Error(`Work-item ID collision: ${id}`);
    ids.add(id);
    mapping.set(item.id, id);
  }
  const original = new Map();
  const work_items = (raw.work_items ?? []).map((item) => {
    const id = mapping.get(item.id);
    const folder = `${id}-${
      String(item.folder ?? item.title)
        .replace(/^(?:\d+[A-Za-z]|[A-Za-z]\d+)-?/, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'work-item'
    }`;
    original.set(id, item.folder);
    return {
      id,
      folder,
      title: item.title,
      kind: item.kind,
      state: lifecycle(item.state ?? item.status ?? 'pending'),
      priority: item.priority ?? 1,
      depends_on: (item.depends_on ?? []).map((dep) => {
        if (!mapping.has(dep)) throw new Error(`Unknown work-item dependency '${dep}'.`);
        return mapping.get(dep);
      }),
      blockers: []
    };
  });
  const text = stringify({ schema_version: 2, work_items }, { lineWidth: 0 });
  parseBacklog(text);
  const workRoot = path.join(flow, 'work-items');
  for (const item of work_items) {
    const previous = path.join(workRoot, original.get(item.id) ?? item.folder);
    const folder = path.join(workRoot, item.folder);
    if (previous !== folder && fs.existsSync(previous)) move(previous, folder);
    if (!fs.existsSync(folder)) {
      if (item.state !== 'pending') throw new Error(`${item.id}: nonpending legacy work has no folder.`);
      continue;
    }
    for (const [old, next] of [
      ['SPEC.md', 'spec.md'],
      ['TASKS.yaml', 'tasks.yaml'],
      ['DECISIONS.md', 'legacy-decisions.md']
    ])
      move(path.join(folder, old), path.join(folder, next));
    if (fs.existsSync(path.join(folder, 'tasks.yaml'))) normalizeTasks(path.join(folder, 'tasks.yaml'), item);
  }
  fs.mkdirSync(path.join(flow, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(flow, 'docs', 'legacy-backlog.yaml'), stringify(raw, { lineWidth: 0 }));
  for (const [old, next] of [
    ['PRD.md', 'prd.md'],
    ['ENGINEERING.md', 'legacy-engineering.md'],
    ['STATE.md', 'legacy-state.md'],
    ['DECISIONS.md', 'legacy-decisions.md'],
    ['SUMMARY.md', 'legacy-summary.md']
  ])
    move(path.join(flow, old), path.join(flow, 'docs', next));
  if (fs.existsSync(path.join(flow, 'GRAPH.md'))) fs.unlinkSync(path.join(flow, 'GRAPH.md'));
  if (oldFile.endsWith('BACKLOG.yaml')) fs.unlinkSync(oldFile);
  fs.writeFileSync(path.join(flow, 'backlog.yaml'), text);
  fs.writeFileSync(path.join(flow, 'docs', 'graph.md'), generateGraphMarkdown(text));
  const state = emptyState();
  state.execution.phase = 'migration_reconciliation';
  state.migration.status = 'pending_reconciliation';
  fs.writeFileSync(path.join(flow, 'state.yaml'), stringifyState(state));
  if (!fs.existsSync(path.join(flow, 'gates.yaml')))
    fs.writeFileSync(path.join(flow, 'gates.yaml'), 'schema_version: 1\ngates: []\n');
  const config = defaultConfig();
  config.runtimes = oldConfig?.runtimes ?? [];
  config.engineering.existing_code_policy = 'improve';
  writeConfig(root, config);
}
export function migrateProject(root) {
  const flow = path.join(root, '.flow');
  if (!fs.existsSync(flow)) throw new Error('.flow does not exist.');
  const config = readConfig(root);
  if (
    config?.schema_version === 2 &&
    fs.existsSync(path.join(flow, 'backlog.yaml')) &&
    parse(fs.readFileSync(path.join(flow, 'backlog.yaml'), 'utf8')).schema_version === 2
  )
    return { unresolved: [], unchanged: true };
  const staging = fs.mkdtempSync(path.join(root, '.flow-migration-'));
  const backup = path.join(staging, 'backup');
  const staged = path.join(staging, '.flow');
  try {
    fs.cpSync(flow, staged, { recursive: true });
    migrateStaged(staging);
    fs.renameSync(flow, backup);
    try {
      fs.renameSync(staged, flow);
    } catch (error) {
      fs.renameSync(backup, flow);
      throw error;
    }
    return { unresolved: ['semantic reconciliation'], unchanged: false };
  } finally {
    // Retain the original backup if even rollback failed; never delete the only copy.
    if (!fs.existsSync(backup) || fs.existsSync(flow)) fs.rmSync(staging, { recursive: true, force: true });
  }
}
export function runMigrate({ args }) {
  const result = migrateProject(projectRoot(args));
  info(
    result.unchanged
      ? 'Already migrated; no files changed.'
      : 'Structural migration complete. Invoke /flow for semantic reconciliation before implementation.'
  );
}
