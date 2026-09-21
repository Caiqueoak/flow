import path from 'node:path';
import { parse } from 'yaml';
import { projectRoot, recordOutput as info, setExitCode } from '../../command-runtime.js';
import { readConfig } from '../../../infrastructure/persistence/configuration.mjs';
import { loadWorkItems } from '../../../infrastructure/persistence/work-items.mjs';
import { parseState } from '../../../domain/workflow/execution-state.mjs';
import { validateProject } from '../../project-validation.mjs';
import { fileExists, readText } from '../../../infrastructure/filesystem/index.js';

interface RuntimeConfiguration {
  skills_path: string;
}

interface ProjectConfiguration {
  flow_version?: string;
  runtimes?: RuntimeConfiguration[];
}

interface DoctorCheck {
  id: string;
  status: 'pass' | 'fail';
  message: string;
  recovery?: string;
}

interface DiagnoseOptions {
  quick?: boolean;
  version?: string;
  packageRoot?: string;
}

interface DoctorResult {
  healthy: boolean;
  mode: 'quick' | 'full';
  configured_version?: string | null;
  executed_version?: string | undefined;
  checks: DoctorCheck[];
}

interface DoctorCommandContext {
  args: string[];
  version: string;
  packageRoot: string;
}

type AddCheck = (id: string, ok: boolean, message: string, recovery?: string) => void;

const readConfigBoundary = readConfig as (root: string) => ProjectConfiguration;
const validateProjectBoundary = validateProject as (root: string, options: { skipTrace: boolean }) => unknown[];

export function diagnoseProject(
  root: string,
  { quick = false, version, packageRoot = root }: DiagnoseOptions = {}
): DoctorResult {
  const checks: DoctorCheck[] = [];
  const add: AddCheck = (id, ok, message, recovery) => {
    checks.push({ id, status: ok ? 'pass' : 'fail', message, ...(recovery ? { recovery } : {}) });
  };

  const flow = path.join(root, '_flow');
  const legacyFlow = path.join(root, '.flow');

  if (!fileExists(flow) && fileExists(legacyFlow)) {
    add(
      'flow-directory',
      false,
      'Legacy .flow directory requires explicit migration to _flow.',
      'Run flow migrate --plan.'
    );

    return {
      healthy: false,
      mode: quick ? 'quick' : 'full',
      configured_version: null,
      executed_version: version,
      checks
    };
  }

  add('flow-directory', fileExists(flow), '_flow directory is present.', 'Run flow init.');

  if (!fileExists(flow)) {
    return { healthy: false, mode: quick ? 'quick' : 'full', checks };
  }

  let config: ProjectConfiguration | undefined;

  try {
    config = readConfigBoundary(root);
  } catch (error) {
    add('config', false, errorMessage(error), 'Repair config.yaml or run migration.');
  }

  add('config', Boolean(config), 'config.yaml is readable.', 'Run flow init.');

  if (config) {
    add(
      'version',
      config.flow_version === version,
      `Project uses ${config.flow_version ?? 'an unversioned legacy release'}; CLI is ${version}.`,
      'Update deliberately, then run flow migrate --plan.'
    );

    const skillCompatible = (config.runtimes ?? []).every((runtime) =>
      fileExists(path.join(root, runtime.skills_path, 'flow', 'SKILL.md'))
    );

    add(
      'integrations',
      skillCompatible,
      'Configured Flow skills are installed.',
      'Run flow init to refresh configured integrations.'
    );
  }

  for (const required of ['config.yaml', 'gates.yaml', 'work-items']) {
    add(
      `artifact:${required}`,
      fileExists(path.join(flow, required)),
      `${required} is present.`,
      'Restore it or run flow init.'
    );
  }

  for (const schema of ['config', 'backlog', 'tasks', 'review', 'gates']) {
    add(
      `schema:${schema}`,
      fileExists(path.join(packageRoot, 'schemas', `${schema}.schema.json`)),
      `${schema} schema is packaged.`,
      'Reinstall the Flow package.'
    );
  }

  if (quick) {
    checkQuickStructure(root, flow, add);
  } else {
    const findings = validateProjectBoundary(root, { skipTrace: false });
    add(
      'invariants',
      findings.length === 0,
      findings.length ? `${findings.length} validation finding(s).` : 'All structural invariants pass.',
      'Run flow validate for details.'
    );
  }

  return {
    healthy: checks.every((check) => check.status === 'pass'),
    mode: quick ? 'quick' : 'full',
    configured_version: config?.flow_version ?? null,
    executed_version: version,
    checks
  };
}

export function runDoctor({ args, version, packageRoot }: DoctorCommandContext): void {
  const result = diagnoseProject(projectRoot(args), {
    quick: args.includes('--quick'),
    version,
    packageRoot
  });

  if (args.includes('--json')) {
    info(JSON.stringify(result, null, 2));
  } else {
    for (const check of result.checks) {
      info(formatCheck(check));
    }
  }

  if (!result.healthy) {
    setExitCode(1);
  }
}

function checkQuickStructure(root: string, flow: string, add: AddCheck): void {
  checkQuickYaml(flow, add);

  try {
    const items = loadWorkItems(root);
    add(
      'work-items',
      true,
      `${items.length} canonical work-item(s) load with valid spec, tasks, review and dependency DAG.`
    );
  } catch (error) {
    add('work-items', false, errorMessage(error), 'Repair the canonical work-item artifacts or run migration.');
  }

  const stateFile = path.join(flow, 'state.yaml');
  if (!fileExists(stateFile)) {
    add('migration-state', true, 'No migration reconciliation state is present.');
    return;
  }

  try {
    const state = parseState(readText(stateFile));
    const message =
      state.migration.status === 'pending_reconciliation'
        ? 'Pending migration reconciliation is recognized.'
        : `Migration state is ${state.migration.status}.`;
    add('migration-state', true, message);
  } catch (error) {
    add('migration-state', false, errorMessage(error), 'Repair state.yaml or rerun migration recovery.');
  }
}

function checkQuickYaml(flow: string, add: AddCheck): void {
  const file = 'gates.yaml';
  const target = path.join(flow, file);

  if (!fileExists(target)) return;

  try {
    parse(readText(target));
    add(`yaml:${file}`, true, `${file} parses.`);
  } catch (error) {
    add(`yaml:${file}`, false, errorMessage(error), 'Repair or migrate the artifact.');
  }
}

function formatCheck(check: DoctorCheck): string {
  const status = check.status === 'pass' ? 'PASS' : 'FAIL';
  const recovery = check.recovery && check.status === 'fail' ? ` ${check.recovery}` : '';
  return `${status} ${check.id}: ${check.message}${recovery}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
