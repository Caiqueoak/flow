import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { info, fail } from '../shared/cli-io.mjs';
import { projectRoot } from '../shared/project-path.mjs';
import { emptyState, stringifyState } from '../artifacts/state.mjs';
import { generateGraphMarkdown } from './graph.mjs';
import { readConfig, writeConfig } from '../shared/project-config.mjs';

const LEGACY_STATES = { done: 'completed', complete: 'completed', completed: 'completed', in_progress: 'in_progress', blocked: 'pending', pending: 'pending' };
function moveIfExists(from, to) { if (!fs.existsSync(from)) return; fs.mkdirSync(path.dirname(to), { recursive: true }); if (!fs.existsSync(to)) fs.renameSync(from, to); }
function numericPart(value) { return String(value).match(/\d+/)?.[0]?.padStart(3, '0') ?? null; }

export function migrateProject(root) {
  const flow = path.join(root, '.flow');
  if (!fs.existsSync(flow)) fail('.flow does not exist.');
  const config = readConfig(root);
  if (config) writeConfig(root, config);
  fs.mkdirSync(path.join(flow, 'docs'), { recursive: true });
  moveIfExists(path.join(flow, 'PRD.md'), path.join(flow, 'docs', 'prd.md'));
  moveIfExists(path.join(flow, 'ENGINEERING.md'), path.join(flow, 'docs', 'engineering.md'));
  moveIfExists(path.join(flow, 'GRAPH.md'), path.join(flow, 'docs', 'graph.md'));

  const oldBacklog = path.join(flow, 'BACKLOG.yaml');
  const newBacklog = path.join(flow, 'backlog.yaml');
  const mapping = new Map();
  if (fs.existsSync(oldBacklog) && !fs.existsSync(newBacklog)) {
    const raw = parse(fs.readFileSync(oldBacklog, 'utf8'));
    for (const item of raw.work_items ?? []) {
      const number = numericPart(item.id ?? item.folder);
      if (!number) fail(`Cannot migrate work-item ID '${item.id}'.`);
      mapping.set(item.id, `W${number}`);
    }
    const migrated = {
      schema_version: 1,
      work_items: (raw.work_items ?? []).map((item) => {
        const id = mapping.get(item.id);
        const number = id.slice(1);
        const slug = String(item.folder ?? item.title).replace(/^\d+[A-Za-z]-?/, '').replace(/^[A-Za-z]\d+-?/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'work-item';
        return {
          id,
          folder: `w${number}-${slug}`,
          kind: item.kind,
          title: item.title,
          state: LEGACY_STATES[item.state ?? item.status] ?? 'pending',
          priority: item.priority ?? 1,
          depends_on: (item.depends_on ?? []).map((dep) => mapping.get(dep) ?? dep),
          blockers: []
        };
      })
    };
    fs.writeFileSync(newBacklog, stringify(migrated, { lineWidth: 0 }));
    fs.unlinkSync(oldBacklog);
  }

  if (fs.existsSync(newBacklog)) {
    const backlog = parse(fs.readFileSync(newBacklog, 'utf8'));
    const workRoot = path.join(flow, 'work-items');
    if (fs.existsSync(workRoot)) {
      const entries = fs.readdirSync(workRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
      for (const item of backlog.work_items ?? []) {
        const number = item.id.slice(1);
        const old = entries.find((entry) => numericPart(entry.name) === number && entry.name !== item.folder);
        if (old && !fs.existsSync(path.join(workRoot, item.folder))) fs.renameSync(path.join(workRoot, old.name), path.join(workRoot, item.folder));
        const folder = path.join(workRoot, item.folder);
        moveIfExists(path.join(folder, 'SPEC.md'), path.join(folder, 'spec.md'));
        moveIfExists(path.join(folder, 'TASKS.yaml'), path.join(folder, 'tasks.yaml'));
        const tasksPath = path.join(folder, 'tasks.yaml');
        if (fs.existsSync(tasksPath)) {
          const tasks = parse(fs.readFileSync(tasksPath, 'utf8'));
          tasks.schema_version = 1;
          tasks.work_item = item.id;
          for (const task of tasks.tasks ?? []) {
            task.state = LEGACY_STATES[task.state ?? task.status] ?? 'pending';
            delete task.status; delete task.commit; delete task.execution_id;
            task.implementation ??= 'commit';
          }
          fs.writeFileSync(tasksPath, stringify(tasks, { lineWidth: 0 }));
        }
      }
    }
    fs.mkdirSync(path.join(flow, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(flow, 'docs', 'graph.md'), generateGraphMarkdown(fs.readFileSync(newBacklog, 'utf8')));
  }
  if (!fs.existsSync(path.join(flow, 'state.yaml'))) fs.writeFileSync(path.join(flow, 'state.yaml'), stringifyState(emptyState()));
  if (fs.existsSync(path.join(flow, 'STATE.md'))) fs.unlinkSync(path.join(flow, 'STATE.md'));

  const unresolved = ['DECISIONS.md', 'SUMMARY.md'].filter((name) => fs.existsSync(path.join(flow, name)));
  return { unresolved };
}

export function runMigrate({ args }) {
  const result = migrateProject(projectRoot(args));
  info('Migrated Flow artifact paths and lifecycle states.');
  if (result.unresolved.length) info(`Manual reconciliation required before validation: ${result.unresolved.join(', ')}.`);
}
