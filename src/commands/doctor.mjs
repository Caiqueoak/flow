import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { info } from '../shared/cli-io.mjs';
import { projectRoot } from '../shared/project-path.mjs';
import { readConfig } from '../shared/project-config.mjs';
import { validateProject } from './validate.mjs';

export function diagnoseProject(root, { quick = false, version, packageRoot } = {}) {
  const checks = [];
  const add = (id, ok, message, recovery) =>
    checks.push({ id, status: ok ? 'pass' : 'fail', message, ...(recovery ? { recovery } : {}) });
  const flow = path.join(root, '_flow');
  const legacyFlow = path.join(root, '.flow');
  if (!fs.existsSync(flow) && fs.existsSync(legacyFlow)) {
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
  add('flow-directory', fs.existsSync(flow), '_flow directory is present.', 'Run flow init.');
  if (!fs.existsSync(flow)) return { healthy: false, mode: quick ? 'quick' : 'full', checks };
  let config;
  try {
    config = readConfig(root);
  } catch (error) {
    add('config', false, error.message, 'Repair config.yaml or run migration.');
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
      fs.existsSync(path.join(root, runtime.skills_path, 'flow', 'SKILL.md'))
    );
    add(
      'integrations',
      skillCompatible,
      'Configured Flow skills are installed.',
      'Run flow init to refresh configured integrations.'
    );
  }
  for (const required of ['config.yaml', 'state.yaml', 'gates.yaml'])
    add(
      `artifact:${required}`,
      fs.existsSync(path.join(flow, required)),
      `${required} is present.`,
      'Restore it or run flow init.'
    );
  for (const schema of ['config', 'backlog', 'tasks', 'state', 'gates'])
    add(
      `schema:${schema}`,
      fs.existsSync(path.join(packageRoot, 'schemas', `${schema}.schema.json`)),
      `${schema} schema is packaged.`,
      'Reinstall the Flow package.'
    );
  if (!quick) {
    const findings = validateProject(root, { skipTrace: false });
    add(
      'invariants',
      findings.length === 0,
      findings.length ? `${findings.length} validation finding(s).` : 'All structural invariants pass.',
      'Run flow validate for details.'
    );
  } else {
    for (const file of ['backlog.yaml', 'state.yaml', 'gates.yaml']) {
      const target = path.join(flow, file);
      if (!fs.existsSync(target)) continue;
      try {
        parse(fs.readFileSync(target, 'utf8'));
        add(`yaml:${file}`, true, `${file} parses.`);
      } catch (error) {
        add(`yaml:${file}`, false, error.message, 'Repair or migrate the artifact.');
      }
    }
  }
  return {
    healthy: checks.every((check) => check.status === 'pass'),
    mode: quick ? 'quick' : 'full',
    configured_version: config?.flow_version ?? null,
    executed_version: version,
    checks
  };
}

export function runDoctor({ args, version, packageRoot }) {
  const result = diagnoseProject(projectRoot(args), { quick: args.includes('--quick'), version, packageRoot });
  if (args.includes('--json')) info(JSON.stringify(result, null, 2));
  else
    for (const check of result.checks)
      info(
        `${check.status === 'pass' ? 'PASS' : 'FAIL'} ${check.id}: ${check.message}${check.recovery && check.status === 'fail' ? ` ${check.recovery}` : ''}`
      );
  if (!result.healthy) process.exitCode = 1;
}
