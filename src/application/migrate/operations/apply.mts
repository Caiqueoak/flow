import path from 'node:path';
import { parse, stringify } from 'yaml';
import { projectRoot, recordOutput as info } from '../../command-runtime.js';
import { emptyState, stringifyState } from '../../../domain/workflow/execution-state.mjs';
import { parseBacklog } from '../../../domain/work-item/backlog.mjs';
import { parseGates } from '../../../domain/gate/gate-definition.mjs';
import { syncProject } from '../../../infrastructure/projections/project.mjs';
import { validateProject } from '../../project-validation.mjs';
import { readConfig, writeConfig, defaultConfig } from '../../../infrastructure/persistence/configuration.mjs';
import { FLOW_SCHEMA_VERSION } from '../../../domain/project/project.js';
import { BACKLOG_SCHEMA_VERSION } from '../../../domain/work-item/work-item.js';
import { GATES_SCHEMA_VERSION } from '../../../domain/gate/gate.js';
import { TASKS_SCHEMA_VERSION } from '../../../domain/task/task.js';
import type { LifecycleState } from '../../../domain/task/task.js';
import {
  copyMigrationDirectory,
  createMigrationWorkspace,
  deleteMigrationFile,
  ensureMigrationDirectory,
  migrationDirectoryEntries,
  migrationDirectoryNames,
  migrationPathExists,
  moveMigrationPath,
  readMigrationText,
  removeMigrationPath,
  renameMigrationPath,
  writeMigrationText
} from '../../../infrastructure/persistence/migration-files.js';

type LegacyIdentifier = string | number;

interface LegacyWorkItem {
  id: LegacyIdentifier;
  folder?: string;
  title: string;
  kind: string;
  state?: string;
  status?: string;
  priority?: number;
  spec_maturity?: string;
  depends_on?: LegacyIdentifier[];
}

interface LegacyBacklog {
  schema_version?: number;
  work_items?: LegacyWorkItem[];
}

interface MigratedWorkItem {
  id: string;
  folder: string;
  title: string;
  kind: string;
  state: LifecycleState;
  priority: number;
  spec_maturity: 'ready';
  depends_on: string[];
  blockers: [];
}

interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
}

export interface MigrationPlan {
  from_version: string;
  to_version: string;
  changes: string[];
  files_affected: string[];
  incompatibilities: string[];
  invalidated_plans: string[];
  affected_approvals: string[];
  human_decisions: string[];
  can_apply: boolean;
}

const STATES: Record<string, LifecycleState> = {
  done: 'completed',
  complete: 'completed',
  completed: 'completed',
  in_progress: 'in_progress',
  blocked: 'pending',
  pending: 'pending',
  todo: 'pending'
};
function lifecycle(value: unknown): LifecycleState {
  const state = STATES[String(value)];
  if (!state) throw new Error(`Unknown legacy state '${value}'.`);
  return state;
}
function number(value: unknown): string {
  const match = String(value).match(/\d+/);
  if (!match) throw new Error(`Cannot normalize ID '${value}'.`);
  return match[0].padStart(3, '0');
}
function createCanonicalShell(base: string, item: MigratedWorkItem): void {
  ensureMigrationDirectory(base);
  writeMigrationText(
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
  writeMigrationText(
    path.join(base, 'tasks.yaml'),
    stringify({ schema_version: TASKS_SCHEMA_VERSION, work_item: item.id, tasks: [] }, { lineWidth: 0 })
  );
  writeMigrationText(
    path.join(base, 'implementation-plan.md'),
    `---\nschema_version: 1\nwork_item: ${item.id}\nstatus: draft\n---\n\n# Implementation Plan\n`
  );
  writeMigrationText(path.join(base, 'review.yaml'), `schema_version: 1\nwork_item: ${item.id}\nstatus: pending\n`);
}
function migrateStaged(root: string, targetVersion: string): void {
  const flow = path.join(root, '_flow');
  const oldConfig = readConfig(root);
  const oldFile = path.join(
    flow,
    migrationPathExists(path.join(flow, 'BACKLOG.yaml')) ? 'BACKLOG.yaml' : 'backlog.yaml'
  );
  const raw = parse(readMigrationText(oldFile)) as LegacyBacklog;
  const mapping = new Map<LegacyIdentifier, string>();
  const ids = new Set<string>();
  for (const item of raw.work_items ?? []) {
    const id = `W${number(item.id)}`;
    if (ids.has(id)) throw new Error(`Work-item ID collision: ${id}`);
    ids.add(id);
    mapping.set(item.id, id);
  }
  const original = new Map<string, string | undefined>();
  const work_items = (raw.work_items ?? []).map((item): MigratedWorkItem => {
    const id = mapping.get(item.id)!;
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
      depends_on: (item.depends_on ?? []).map((dep): string => {
        if (!mapping.has(dep)) throw new Error(`Unknown work-item dependency '${dep}'.`);
        return mapping.get(dep)!;
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
    if (previous !== folder && migrationPathExists(previous)) moveMigrationPath(previous, folder);
    const archive = path.join(flow, 'docs', 'legacy-work-items', item.folder);
    if (migrationPathExists(folder)) {
      ensureMigrationDirectory(path.dirname(archive));
      copyMigrationDirectory(folder, archive);
      removeMigrationPath(folder);
    }
    createCanonicalShell(folder, item);
  }
  ensureMigrationDirectory(path.join(flow, 'docs'));
  for (const [old, next] of [
    ['PRD.md', 'prd.md'],
    ['ENGINEERING.md', 'legacy-engineering.md'],
    ['STATE.md', 'legacy-state.md'],
    ['DECISIONS.md', 'legacy-decisions.md'],
    ['SUMMARY.md', 'legacy-summary.md']
  ] as const)
    moveMigrationPath(path.join(flow, old), path.join(flow, 'docs', next));
  if (migrationPathExists(path.join(flow, 'GRAPH.md'))) deleteMigrationFile(path.join(flow, 'GRAPH.md'));
  if (migrationPathExists(oldFile)) moveMigrationPath(oldFile, path.join(flow, 'docs', 'legacy-backlog.yaml'));
  const state = emptyState();
  state.execution.phase = 'reconcile';
  state.execution.step = 'resolve_conflicts';
  state.migration.status = 'pending_reconciliation';
  writeMigrationText(path.join(flow, 'state.yaml'), stringifyState(state));
  if (!migrationPathExists(path.join(flow, 'gates.yaml')))
    writeMigrationText(path.join(flow, 'gates.yaml'), `schema_version: ${GATES_SCHEMA_VERSION}\ngates: []\n`);
  const config = defaultConfig(targetVersion);
  config.runtimes = oldConfig?.runtimes ?? [];
  config.engineering.existing_code_policy = 'improve';
  writeConfig(root, config);
}
function hasLegacyBacklog(flow: string): boolean {
  return migrationPathExists(path.join(flow, 'BACKLOG.yaml')) || migrationPathExists(path.join(flow, 'backlog.yaml'));
}
function inspectCurrent(root: string, targetVersion: string): string[] {
  const flow = path.join(root, '_flow');
  const changes: string[] = [];
  try {
    const config = readConfig(root);
    if (!config || config.schema_version !== FLOW_SCHEMA_VERSION || config.flow_version !== targetVersion)
      changes.push('upgrade config.yaml');
  } catch {
    changes.push('upgrade config.yaml');
  }
  const workItems = path.join(flow, 'work-items');
  if (!migrationPathExists(workItems)) changes.push('restore work-items directory');
  else
    for (const entry of migrationDirectoryEntries(workItems)) {
      if (!entry.isDirectory) continue;
      const tasks = path.join(workItems, entry.name, 'tasks.yaml');
      if (!migrationPathExists(tasks)) {
        changes.push(`restore work-items/${entry.name}/tasks.yaml`);
        continue;
      }
      try {
        const value = asRecord(parse(readMigrationText(tasks)));
        const parsedTasks = Array.isArray(value.tasks) ? value.tasks : [];
        if (
          value.schema_version !== TASKS_SCHEMA_VERSION ||
          parsedTasks.some(
            (task: unknown) =>
              isRecord(task) &&
              ['traceability', 'implementation', 'commit_sha'].some((field) => Object.hasOwn(task, field))
          )
        )
          changes.push(`upgrade work-items/${entry.name}/tasks.yaml`);
      } catch {
        changes.push(`upgrade work-items/${entry.name}/tasks.yaml`);
      }
    }
  try {
    parseGates(readMigrationText(path.join(flow, 'gates.yaml')));
  } catch {
    changes.push('upgrade gates.yaml');
  }
  return [...new Set(changes)];
}

function parseFlowVersion(version: string): SemanticVersion | null {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function compareFlowVersions(left: SemanticVersion, right: SemanticVersion): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function migrationIncompatibilities(source: string, target: string): string[] {
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

export function migrationPlan(root: string, targetVersion = '0.6.0'): MigrationPlan {
  const currentFlow = path.join(root, '_flow');
  const legacyFlow = path.join(root, '.flow');
  if (migrationPathExists(currentFlow) && migrationPathExists(legacyFlow))
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
  const usesLegacyDirectory = !migrationPathExists(currentFlow) && migrationPathExists(legacyFlow);
  const flow = usesLegacyDirectory ? legacyFlow : currentFlow;
  if (!migrationPathExists(flow)) throw new Error('_flow does not exist.');
  const rawConfigFile = path.join(flow, 'config.yaml');
  const rawConfig = migrationPathExists(rawConfigFile) ? asRecord(parse(readMigrationText(rawConfigFile))) : {};
  const framework = asRecord(rawConfig.framework);
  const config = usesLegacyDirectory
    ? {
        flow_version:
          typeof rawConfig.flow_version === 'string'
            ? rawConfig.flow_version
            : typeof framework.version === 'string'
              ? framework.version
              : null
      }
    : readConfig(root);
  const files = migrationDirectoryNames(flow);
  const legacy = files.filter((name) =>
    ['BACKLOG.yaml', 'PRD.md', 'ENGINEERING.md', 'STATE.md', 'DECISIONS.md', 'SUMMARY.md', 'GRAPH.md'].includes(name)
  );
  const changes: string[] = [];
  const invalidatedPlans: string[] = [];
  if (usesLegacyDirectory) changes.push('rename the canonical project directory from .flow to _flow');
  if (!config?.flow_version || config.flow_version !== targetVersion)
    changes.push('record executed Flow package version');
  if (legacy.length) changes.push('normalize legacy artifact names and IDs');
  if (!usesLegacyDirectory) changes.push(...inspectCurrent(root, targetVersion));
  const backlogFile = path.join(flow, 'backlog.yaml');
  if (usesLegacyDirectory && migrationPathExists(backlogFile)) {
    const backlog = parse(readMigrationText(backlogFile)) as LegacyBacklog;
    backlog.schema_version = BACKLOG_SCHEMA_VERSION;
    if ((backlog.work_items ?? []).some((item) => !item.spec_maturity))
      changes.push('derive initial spec_maturity from existing artifacts');
    for (const item of backlog.work_items ?? []) {
      const planFile = path.join(flow, 'work-items', item.folder ?? '', 'implementation-plan.md');
      if ((item.state ?? item.status) !== 'completed' && migrationPathExists(planFile))
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

function upgradeCanonicalStaged(root: string, targetVersion: string): void {
  const flow = path.join(root, '_flow');
  const workItems = path.join(flow, 'work-items');
  if (migrationPathExists(workItems))
    for (const entry of migrationDirectoryEntries(workItems)) {
      if (!entry.isDirectory) continue;
      const taskPath = path.join(workItems, entry.name, 'tasks.yaml');
      if (!migrationPathExists(taskPath)) continue;
      const value = asRecord(parse(readMigrationText(taskPath)));
      value.schema_version = TASKS_SCHEMA_VERSION;
      const tasks = Array.isArray(value.tasks) ? value.tasks : [];
      for (const rawTask of tasks) {
        if (!isRecord(rawTask)) continue;
        const task = rawTask;
        if (task.state === 'completed' && task.commit_sha) {
          task.legacy_commit ??= task.commit_sha;
          task.provenance = 'legacy_migration';
        }
        delete task.traceability;
        delete task.implementation;
        delete task.commit_sha;
      }
      writeMigrationText(taskPath, stringify(value, { lineWidth: 0 }));
    }
  const config = readConfig(root) ?? defaultConfig(targetVersion);
  config.flow_version = targetVersion;
  writeConfig(root, config);
  const gatesFile = path.join(flow, 'gates.yaml');
  if (!migrationPathExists(gatesFile))
    writeMigrationText(gatesFile, `schema_version: ${GATES_SCHEMA_VERSION}\ngates: []\n`);
  else {
    const gates = asRecord(parse(readMigrationText(gatesFile)));
    gates.schema_version = GATES_SCHEMA_VERSION;
    const gateList = Array.isArray(gates.gates) ? gates.gates : [];
    for (const rawGate of gateList) {
      if (!isRecord(rawGate)) continue;
      const gate = rawGate;
      gate.stage ??= 'full';
      gate.cost ??= 'medium';
      gate.scope ??= {};
    }
    writeMigrationText(gatesFile, stringify(gates, { lineWidth: 0 }));
  }
}

export function migrateProject(root: string, { targetVersion = '0.6.0' }: { targetVersion?: string } = {}) {
  const plan = migrationPlan(root, targetVersion);
  if (!plan.can_apply) throw new Error(plan.incompatibilities.join(' '));
  const targetFlow = path.join(root, '_flow');
  const legacyFlow = path.join(root, '.flow');
  const sourceFlow = migrationPathExists(targetFlow) ? targetFlow : legacyFlow;
  const usesLegacyDirectory = sourceFlow === legacyFlow;
  if (!usesLegacyDirectory && plan.changes.length === 0) return { unresolved: [], unchanged: true };
  const staging = createMigrationWorkspace(path.join(root, '_flow-migration-'));
  const backup = path.join(staging, 'backup');
  const staged = path.join(staging, '_flow');
  let preserveStaging = false;
  try {
    copyMigrationDirectory(sourceFlow, staged);
    if (usesLegacyDirectory || hasLegacyBacklog(staged)) migrateStaged(staging, targetVersion);
    else upgradeCanonicalStaged(staging, targetVersion);
    syncProject(staging);
    const findings = validateProject(staging);
    if (findings.length)
      throw new Error(`Migration staging validation failed: ${findings.map((x) => x.code).join(', ')}.`);
    renameMigrationPath(sourceFlow, backup);
    try {
      renameMigrationPath(staged, targetFlow);
    } catch (error) {
      renameMigrationPath(backup, sourceFlow);
      throw error;
    }
    const backupRoot = path.join(root, '_flow-backups');
    ensureMigrationDirectory(backupRoot);
    const backupTarget = path.join(backupRoot, `migration-${Date.now()}`);
    renameMigrationPath(backup, backupTarget);
    return { unresolved: ['semantic reconciliation'], unchanged: false, backup: backupTarget };
  } catch (error: unknown) {
    preserveStaging = Boolean(isRecord(error) && error.preserveRecoveryData);
    throw error;
  } finally {
    // Retain the original backup if even rollback failed; never delete the only copy.
    if (
      !preserveStaging &&
      (!migrationPathExists(backup) || migrationPathExists(targetFlow) || migrationPathExists(sourceFlow))
    )
      removeMigrationPath(staging);
  }
}
export function runMigrate({ args, version }: { args: string[]; version: string }): void {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
