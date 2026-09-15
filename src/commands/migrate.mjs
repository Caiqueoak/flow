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
import {
  BACKLOG_SCHEMA_VERSION,
  FLOW_SCHEMA_VERSION,
  GATES_SCHEMA_VERSION,
  STATE_SCHEMA_VERSION,
  TASKS_SCHEMA_VERSION
} from '../domain/contracts.mjs';

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
      traceability:
        state === 'completed' ? 'legacy' : (task.traceability ?? task.implementation) === 'none' ? 'none' : 'commit'
    };
    if (task.commit) result.legacy_commit = task.commit;
    delete result.commit;
    delete result.status;
    delete result.execution_id;
    delete result.implementation;
    return result;
  });
  const text = stringify({ schema_version: TASKS_SCHEMA_VERSION, work_item: item.id, tasks }, { lineWidth: 0 });
  parseTasks(text, { expectedWorkItem: item.id });
  fs.writeFileSync(file, text);
}
function migrateStaged(root) {
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
    if (!fs.existsSync(folder)) {
      if (item.state !== 'pending') throw new Error(`${item.id}: nonpending legacy work has no folder.`);
      item.spec_maturity = 'outlined';
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
  if (oldFile.endsWith('BACKLOG.yaml')) move(oldFile, path.join(flow, 'backlog.yaml'));
  const finalBacklogText = stringify({ schema_version: BACKLOG_SCHEMA_VERSION, work_items }, { lineWidth: 0 });
  parseBacklog(finalBacklogText);
  fs.writeFileSync(path.join(flow, 'backlog.yaml'), finalBacklogText);
  fs.writeFileSync(path.join(flow, 'docs', 'graph.md'), generateGraphMarkdown(finalBacklogText));
  const state = emptyState();
  state.execution.phase = 'reconcile';
  state.execution.step = 'resolve_conflicts';
  state.migration.status = 'pending_reconciliation';
  fs.writeFileSync(path.join(flow, 'state.yaml'), stringifyState(state));
  if (!fs.existsSync(path.join(flow, 'gates.yaml')))
    fs.writeFileSync(path.join(flow, 'gates.yaml'), `schema_version: ${GATES_SCHEMA_VERSION}\ngates: []\n`);
  const config = defaultConfig();
  config.runtimes = oldConfig?.runtimes ?? [];
  config.engineering.existing_code_policy = 'improve';
  writeConfig(root, config);
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
  const backlogFile = path.join(flow, 'backlog.yaml');
  if (fs.existsSync(backlogFile)) {
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
  const knownSource = source === 'legacy' || source === targetVersion || /^0\.[45]\./.test(source);
  return {
    from_version: source,
    to_version: targetVersion,
    changes,
    files_affected: [...legacy, 'config.yaml', 'backlog.yaml', 'state.yaml', 'gates.yaml'],
    incompatibilities: knownSource ? [] : [`Unknown source version '${source}'.`],
    invalidated_plans: invalidatedPlans,
    affected_approvals: invalidatedPlans,
    human_decisions: changes.length
      ? ['Reconcile preserved product, engineering, spec and traceability semantics before implementation.']
      : [],
    can_apply: knownSource
  };
}

function upgradeCurrentStaged(root, targetVersion) {
  const flow = path.join(root, '_flow');
  const backlogFile = path.join(flow, 'backlog.yaml');
  if (fs.existsSync(backlogFile)) {
    const backlog = parse(fs.readFileSync(backlogFile, 'utf8'));
    backlog.schema_version = BACKLOG_SCHEMA_VERSION;
    for (const item of backlog.work_items ?? []) {
      item.spec_maturity ??= fs.existsSync(path.join(flow, 'work-items', item.folder, 'spec.md'))
        ? 'ready'
        : 'outlined';
      const taskPath = path.join(flow, 'work-items', item.folder, 'tasks.yaml');
      if (fs.existsSync(taskPath)) {
        const value = parse(fs.readFileSync(taskPath, 'utf8'));
        value.schema_version = TASKS_SCHEMA_VERSION;
        for (const task of value.tasks ?? []) {
          task.traceability =
            task.state === 'completed' && !task.commit_sha
              ? 'legacy'
              : (task.traceability ?? task.implementation ?? 'commit');
          delete task.implementation;
        }
        fs.writeFileSync(taskPath, stringify(value, { lineWidth: 0 }));
      }
    }
    const text = stringify(backlog, { lineWidth: 0 });
    parseBacklog(text);
    fs.writeFileSync(backlogFile, text);
    fs.mkdirSync(path.join(flow, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(flow, 'docs', 'graph.md'), generateGraphMarkdown(text));
  }
  const config = readConfig(root) ?? defaultConfig(targetVersion);
  config.flow_version = targetVersion;
  writeConfig(root, config);
  const stateFile = path.join(flow, 'state.yaml');
  if (!fs.existsSync(stateFile)) {
    const state = emptyState();
    state.execution = { phase: 'reconcile', step: 'resolve_conflicts' };
    state.migration = { status: 'pending_reconciliation' };
    fs.writeFileSync(stateFile, stringifyState(state));
  } else {
    const rawState = parse(fs.readFileSync(stateFile, 'utf8'));
    rawState.schema_version = STATE_SCHEMA_VERSION;
    const phaseMap = {
      engineering_bootstrap: 'engineering',
      backlog_planning: 'backlog',
      work_item_plan_approval: 'planning',
      build: 'implementation',
      work_item_review: 'review',
      migration_reconciliation: 'reconcile'
    };
    rawState.execution ??= {};
    rawState.execution.phase = phaseMap[rawState.execution.phase] ?? rawState.execution.phase ?? 'discovery';
    const defaults = {
      discovery: 'define_problem',
      prd: 'draft',
      engineering: 'draft',
      backlog: 'route',
      specification: 'deepen',
      planning: 'prepare_plan',
      implementation: 'execute_task',
      review: 'review_work_item',
      reconcile: 'resolve_conflicts',
      complete: 'finished'
    };
    rawState.execution.step = defaults[rawState.execution.phase];
    delete rawState.execution.id;
    delete rawState.execution.workflow_hash;
    rawState.execution = { phase: 'reconcile', step: 'resolve_conflicts' };
    rawState.migration = { status: 'pending_reconciliation' };
    rawState.active = { work_item: null, task: null };
    rawState.stop_reason = null;
    fs.writeFileSync(stateFile, stringifyState(rawState));
  }
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
  const config = usesLegacyDirectory ? null : readConfig(root);
  if (
    !usesLegacyDirectory &&
    config?.schema_version === FLOW_SCHEMA_VERSION &&
    config.flow_version === targetVersion &&
    fs.existsSync(path.join(targetFlow, 'backlog.yaml')) &&
    parse(fs.readFileSync(path.join(targetFlow, 'backlog.yaml'), 'utf8')).schema_version === BACKLOG_SCHEMA_VERSION
  )
    return { unresolved: [], unchanged: true };
  const staging = fs.mkdtempSync(path.join(root, '_flow-migration-'));
  const backup = path.join(staging, 'backup');
  const staged = path.join(staging, '_flow');
  let preserveStaging = false;
  try {
    fs.cpSync(sourceFlow, staged, { recursive: true });
    const stagedConfig = readConfig(staging);
    if (stagedConfig?.schema_version >= 2 && fs.readdirSync(staged).includes('backlog.yaml'))
      upgradeCurrentStaged(staging, targetVersion);
    else migrateStaged(staging);
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
