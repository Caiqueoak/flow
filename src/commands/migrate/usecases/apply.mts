// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { writeOutput as info } from '../../../cli/terminal/output.js';
import { projectRoot } from '../../../cli/command-input/project-root.js';
import { emptyState, stringifyState } from '../../../execution/execution-state.mjs';
import { parseBacklog } from '../../../artifacts/backlog.mjs';
import { parseGates } from '../../../artifacts/gate-definitions.mjs';
import { syncProject } from '../../../flow-project/projections.mjs';
import { validateProject } from '../../../flow-project/validation.mjs';
import { readConfig, writeConfig, defaultConfig } from '../../../flow-project/configuration.mjs';
import {
  BACKLOG_SCHEMA_VERSION,
  FLOW_SCHEMA_VERSION,
  GATES_SCHEMA_VERSION,
  TASKS_SCHEMA_VERSION
} from '../../../contracts/contracts.js';

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
function temporarySibling(file) {
  const directory = path.dirname(file);
  const base = path.basename(file);
  let attempt = 0;
  let temporary;
  do {
    temporary = path.join(directory, `.${base}_flow-migration-${process.pid}-${Date.now()}-${attempt++}`);
  } while (fs.existsSync(temporary));
  return temporary;
}
function sameEntry(from, to) {
  return fs.realpathSync.native(from) === fs.realpathSync.native(to);
}
function move(from, to) {
  if (!fs.existsSync(from)) return;
  if (path.resolve(from) === path.resolve(to)) return;
  if (fs.existsSync(to)) {
    if (!sameEntry(from, to)) throw new Error(`Migration destination already exists: ${to}`);
    const temporary = temporarySibling(from);
    fs.renameSync(from, temporary);
    try {
      fs.renameSync(temporary, to);
    } catch (error) {
      try {
        fs.renameSync(temporary, from);
      } catch (recoveryError) {
        error.preserveRecoveryData = true;
        error.recovery = { from, to, temporary, recoveryError };
      }
      throw error;
    }
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
}
function createCanonicalShell(base, item) {
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(
    path.join(base, 'spec.md'),
    `---\n${stringify({
      schema_version: 1,
      work_item: item.id,
      title: item.title,
      kind: item.kind,
      priority: item.priority,
      depends_on: item.depends_on,
      blockers: [],
      maturity: 'outlined'
    }).trimEnd()}\n---\n\n# Work Item Specification\n`
  );
  fs.writeFileSync(
    path.join(base, 'tasks.yaml'),
    stringify({ schema_version: TASKS_SCHEMA_VERSION, work_item: item.id, tasks: [] }, { lineWidth: 0 })
  );
  fs.writeFileSync(
    path.join(base, 'implementation-plan.md'),
    `---\nschema_version: 1\nwork_item: ${item.id}\nstatus: draft\n---\n\n# Implementation Plan\n`
  );
  fs.writeFileSync(path.join(base, 'review.yaml'), `schema_version: 1\nwork_item: ${item.id}\nstatus: pending\n`);
}
function migrateStaged(root, targetVersion) {
  const flow = path.join(root, '_flow');
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
        .replace(new RegExp(`^${id}-`, 'i'), '')
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
      spec_maturity: 'ready',
      depends_on: (item.depends_on ?? []).map((dep) => {
        if (!mapping.has(dep)) throw new Error(`Unknown work-item dependency '${dep}'.`);
        return mapping.get(dep);
      }),
      blockers: []
    };
  });
  const text = stringify({ schema_version: BACKLOG_SCHEMA_VERSION, work_items }, { lineWidth: 0 });
  parseBacklog(text);
  const workRoot = path.join(flow, 'work-items');
  for (const item of work_items) {
    const previous = path.join(workRoot, original.get(item.id) ?? item.folder);
    const folder = path.join(workRoot, item.folder);
    if (previous !== folder && fs.existsSync(previous)) move(previous, folder);
    const archive = path.join(flow, 'docs', 'legacy-work-items', item.folder);
    if (fs.existsSync(folder)) {
      fs.mkdirSync(path.dirname(archive), { recursive: true });
      fs.cpSync(folder, archive, { recursive: true });
      fs.rmSync(folder, { recursive: true, force: true });
    }
    createCanonicalShell(folder, item);
  }
  fs.mkdirSync(path.join(flow, 'docs'), { recursive: true });
  for (const [old, next] of [
    ['PRD.md', 'prd.md'],
    ['ENGINEERING.md', 'legacy-engineering.md'],
    ['STATE.md', 'legacy-state.md'],
    ['DECISIONS.md', 'legacy-decisions.md'],
    ['SUMMARY.md', 'legacy-summary.md']
  ])
    move(path.join(flow, old), path.join(flow, 'docs', next));
  if (fs.existsSync(path.join(flow, 'GRAPH.md'))) fs.unlinkSync(path.join(flow, 'GRAPH.md'));
  if (fs.existsSync(oldFile)) move(oldFile, path.join(flow, 'docs', 'legacy-backlog.yaml'));
  const state = emptyState();
  state.execution.phase = 'reconcile';
  state.execution.step = 'resolve_conflicts';
  state.migration.status = 'pending_reconciliation';
  fs.writeFileSync(path.join(flow, 'state.yaml'), stringifyState(state));
  if (!fs.existsSync(path.join(flow, 'gates.yaml')))
    fs.writeFileSync(path.join(flow, 'gates.yaml'), `schema_version: ${GATES_SCHEMA_VERSION}\ngates: []\n`);
  const config = defaultConfig(targetVersion);
  config.runtimes = oldConfig?.runtimes ?? [];
  config.engineering.existing_code_policy = 'improve';
  writeConfig(root, config);
}
function hasLegacyBacklog(flow) {
  return fs.existsSync(path.join(flow, 'BACKLOG.yaml')) || fs.existsSync(path.join(flow, 'backlog.yaml'));
}
function inspectCurrent(root, targetVersion) {
  const flow = path.join(root, '_flow');
  const changes = [];
  try {
    const config = readConfig(root);
    if (!config || config.schema_version !== FLOW_SCHEMA_VERSION || config.flow_version !== targetVersion)
      changes.push('upgrade config.yaml');
  } catch {
    changes.push('upgrade config.yaml');
  }
  const workItems = path.join(flow, 'work-items');
  if (!fs.existsSync(workItems)) changes.push('restore work-items directory');
  else
    for (const entry of fs.readdirSync(workItems, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const tasks = path.join(workItems, entry.name, 'tasks.yaml');
      if (!fs.existsSync(tasks)) {
        changes.push(`restore work-items/${entry.name}/tasks.yaml`);
        continue;
      }
      try {
        const value = parse(fs.readFileSync(tasks, 'utf8')) ?? {};
        if (
          value.schema_version !== TASKS_SCHEMA_VERSION ||
          (value.tasks ?? []).some((task) =>
            ['traceability', 'implementation', 'commit_sha'].some((field) => Object.hasOwn(task, field))
          )
        )
          changes.push(`upgrade work-items/${entry.name}/tasks.yaml`);
      } catch {
        changes.push(`upgrade work-items/${entry.name}/tasks.yaml`);
      }
    }
  try {
    parseGates(fs.readFileSync(path.join(flow, 'gates.yaml'), 'utf8'));
  } catch {
    changes.push('upgrade gates.yaml');
  }
  return [...new Set(changes)];
}

function parseFlowVersion(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function compareFlowVersions(left, right) {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function migrationIncompatibilities(source, target) {
  if (source === 'legacy') return [];

  const sourceVersion = parseFlowVersion(source);
  const targetVersion = parseFlowVersion(target);
  if (!sourceVersion) return [`Unknown source version '${source}'. Expected a semantic version such as 0.8.0.`];
  if (!targetVersion) return [`Unknown target version '${target}'. Expected a semantic version such as 0.8.0.`];

  if (compareFlowVersions(sourceVersion, targetVersion) > 0)
    return [`Cannot migrate from newer Flow version '${source}' to older target '${target}'.`];

  if (sourceVersion.major !== targetVersion.major)
    return [`Unsupported major-version migration from '${source}' to '${target}'.`];

  return [];
}

export function migrationPlan(root, targetVersion = '0.6.0') {
  const currentFlow = path.join(root, '_flow');
  const legacyFlow = path.join(root, '.flow');
  if (fs.existsSync(currentFlow) && fs.existsSync(legacyFlow))
    return {
      from_version: 'ambiguous',
      to_version: targetVersion,
      changes: [],
      files_affected: [],
      incompatibilities: ['Both .flow and _flow exist; reconcile the authoritative directory first.'],
      invalidated_plans: [],
      affected_approvals: [],
      human_decisions: ['Choose the authoritative Flow directory.'],
      can_apply: false
    };
  const usesLegacyDirectory = !fs.existsSync(currentFlow) && fs.existsSync(legacyFlow);
  const flow = usesLegacyDirectory ? legacyFlow : currentFlow;
  if (!fs.existsSync(flow)) throw new Error('_flow does not exist.');
  const rawConfigFile = path.join(flow, 'config.yaml');
  const rawConfig = fs.existsSync(rawConfigFile) ? (parse(fs.readFileSync(rawConfigFile, 'utf8')) ?? {}) : {};
  const config = usesLegacyDirectory
    ? { flow_version: rawConfig.flow_version ?? rawConfig.framework?.version ?? null }
    : readConfig(root);
  const files = fs.readdirSync(flow);
  const legacy = files.filter((name) =>
    ['BACKLOG.yaml', 'PRD.md', 'ENGINEERING.md', 'STATE.md', 'DECISIONS.md', 'SUMMARY.md', 'GRAPH.md'].includes(name)
  );
  const changes = [];
  const invalidatedPlans = [];
  if (usesLegacyDirectory) changes.push('rename the canonical project directory from .flow to _flow');
  if (!config?.flow_version || config.flow_version !== targetVersion)
    changes.push('record executed Flow package version');
  if (legacy.length) changes.push('normalize legacy artifact names and IDs');
  if (!usesLegacyDirectory) changes.push(...inspectCurrent(root, targetVersion));
  const backlogFile = path.join(flow, 'backlog.yaml');
  if (usesLegacyDirectory && fs.existsSync(backlogFile)) {
    const backlog = parse(fs.readFileSync(backlogFile, 'utf8'));
    backlog.schema_version = BACKLOG_SCHEMA_VERSION;
    if ((backlog.work_items ?? []).some((item) => !item.spec_maturity))
      changes.push('derive initial spec_maturity from existing artifacts');
    for (const item of backlog.work_items ?? []) {
      const planFile = path.join(flow, 'work-items', item.folder ?? '', 'implementation-plan.md');
      if ((item.state ?? item.status) !== 'completed' && fs.existsSync(planFile))
        invalidatedPlans.push(`${item.id}: work-items/${item.folder}/implementation-plan.md`);
    }
  }
  const source = config?.flow_version ?? 'legacy';
  const incompatibilities = migrationIncompatibilities(source, targetVersion);
  return {
    from_version: source,
    to_version: targetVersion,
    changes,
    files_affected: [...legacy, 'config.yaml', 'backlog.yaml', 'state.yaml', 'gates.yaml'],
    incompatibilities,
    invalidated_plans: invalidatedPlans,
    affected_approvals: invalidatedPlans,
    human_decisions: changes.length
      ? ['Reconcile preserved product, engineering, spec and traceability semantics before implementation.']
      : [],
    can_apply: incompatibilities.length === 0
  };
}

function upgradeCanonicalStaged(root, targetVersion) {
  const flow = path.join(root, '_flow');
  const workItems = path.join(flow, 'work-items');
  if (fs.existsSync(workItems))
    for (const entry of fs.readdirSync(workItems, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const taskPath = path.join(workItems, entry.name, 'tasks.yaml');
      if (!fs.existsSync(taskPath)) continue;
      const value = parse(fs.readFileSync(taskPath, 'utf8')) ?? {};
      value.schema_version = TASKS_SCHEMA_VERSION;
      for (const task of value.tasks ?? []) {
        if (task.state === 'completed' && task.commit_sha) {
          task.legacy_commit ??= task.commit_sha;
          task.provenance = 'legacy_migration';
        }
        delete task.traceability;
        delete task.implementation;
        delete task.commit_sha;
      }
      fs.writeFileSync(taskPath, stringify(value, { lineWidth: 0 }));
    }
  const config = readConfig(root) ?? defaultConfig(targetVersion);
  config.flow_version = targetVersion;
  writeConfig(root, config);
  const gatesFile = path.join(flow, 'gates.yaml');
  if (!fs.existsSync(gatesFile)) fs.writeFileSync(gatesFile, `schema_version: ${GATES_SCHEMA_VERSION}\ngates: []\n`);
  else {
    const gates = parse(fs.readFileSync(gatesFile, 'utf8'));
    gates.schema_version = GATES_SCHEMA_VERSION;
    for (const gate of gates.gates ?? []) {
      gate.stage ??= 'full';
      gate.cost ??= 'medium';
      gate.scope ??= {};
    }
    fs.writeFileSync(gatesFile, stringify(gates, { lineWidth: 0 }));
  }
}

export function migrateProject(root, { targetVersion = '0.6.0' } = {}) {
  const plan = migrationPlan(root, targetVersion);
  if (!plan.can_apply) throw new Error(plan.incompatibilities.join(' '));
  const targetFlow = path.join(root, '_flow');
  const legacyFlow = path.join(root, '.flow');
  const sourceFlow = fs.existsSync(targetFlow) ? targetFlow : legacyFlow;
  const usesLegacyDirectory = sourceFlow === legacyFlow;
  if (!usesLegacyDirectory && plan.changes.length === 0) return { unresolved: [], unchanged: true };
  const staging = fs.mkdtempSync(path.join(root, '_flow-migration-'));
  const backup = path.join(staging, 'backup');
  const staged = path.join(staging, '_flow');
  let preserveStaging = false;
  try {
    fs.cpSync(sourceFlow, staged, { recursive: true });
    if (usesLegacyDirectory || hasLegacyBacklog(staged)) migrateStaged(staging, targetVersion);
    else upgradeCanonicalStaged(staging, targetVersion);
    syncProject(staging);
    const findings = validateProject(staging);
    if (findings.length)
      throw new Error(`Migration staging validation failed: ${findings.map((x) => x.code).join(', ')}.`);
    fs.renameSync(sourceFlow, backup);
    try {
      fs.renameSync(staged, targetFlow);
    } catch (error) {
      fs.renameSync(backup, sourceFlow);
      throw error;
    }
    const backupRoot = path.join(root, '_flow-backups');
    fs.mkdirSync(backupRoot, { recursive: true });
    const backupTarget = path.join(backupRoot, `migration-${Date.now()}`);
    fs.renameSync(backup, backupTarget);
    return { unresolved: ['semantic reconciliation'], unchanged: false, backup: backupTarget };
  } catch (error) {
    preserveStaging = Boolean(error?.preserveRecoveryData);
    throw error;
  } finally {
    // Retain the original backup if even rollback failed; never delete the only copy.
    if (!preserveStaging && (!fs.existsSync(backup) || fs.existsSync(targetFlow) || fs.existsSync(sourceFlow)))
      fs.rmSync(staging, { recursive: true, force: true });
  }
}
export function runMigrate({ args, version }) {
  const root = projectRoot(args);
  if (args.includes('--plan')) {
    const plan = migrationPlan(root, version);
    return info(
      args.includes('--json')
        ? JSON.stringify(plan, null, 2)
        : `Migration ${plan.from_version} -> ${plan.to_version}\n${plan.changes.length ? plan.changes.map((change) => `- ${change}`).join('\n') : 'No structural changes required.'}`
    );
  }
  const result = migrateProject(root, { targetVersion: version });
  info(
    result.unchanged
      ? 'Already migrated; no files changed.'
      : 'Structural migration complete. Invoke /flow for semantic reconciliation before implementation.'
  );
}
