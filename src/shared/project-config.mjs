import fs from 'node:fs';
import path from 'node:path';

export function configPath(root) {
  return path.join(root, '.flow', 'config.yaml');
}

function quoteYaml(value) {
  return /^[A-Za-z0-9_.\\/-]+$/.test(value) ? value : JSON.stringify(value);
}

export function defaultConfig(version) {
  return {
    frameworkVersion: version,
    runtimes: [],
    continueAcrossWorkItems: true,
    workItemsConcurrency: 'auto',
    taskConcurrency: 'auto'
  };
}

export function readConfig(root, version) {
  const file = configPath(root);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const config = defaultConfig(version);
  const frameworkVersion = text.match(/^[ \t]*version:[ \t]*([^\s#]+)[ \t]*$/m);
  if (frameworkVersion) config.frameworkVersion = frameworkVersion[1].replace(/^['"]|['"]$/g, '');
  const runtimeBlock = text.match(/^runtimes:\s*\n([\s\S]*?)(?=^[A-Za-z_][A-Za-z0-9_]*:|(?![\s\S]))/m)?.[1] || '';
  const entries = runtimeBlock.split(/(?=^\s*-\s+type:)/m).filter((entry) => /-\s+type:/.test(entry));
  for (const entry of entries) {
    const type = entry.match(/-\s+type:\s*([^\s#]+)/)?.[1]?.replace(/^['"]|['"]$/g, '');
    const skillsPath = entry
      .match(/skills_path:\s*([^\n#]+)/)?.[1]
      ?.trim()
      .replace(/^['"]|['"]$/g, '');
    if (type && skillsPath) config.runtimes.push({ type, skills_path: skillsPath });
  }
  return config;
}

export function writeConfig(root, config, version) {
  const lines = ['schema_version: 1', 'framework:', '  name: flow', `  version: ${version}`, 'runtimes:'];
  if (!config.runtimes.length) lines.push('  []');
  else {
    for (const runtime of config.runtimes) {
      lines.push(`  - type: ${quoteYaml(runtime.type)}`);
      lines.push(`    skills_path: ${quoteYaml(runtime.skills_path)}`);
    }
  }
  lines.push(
    'autonomy:',
    '  continue_across_work_items: true',
    '  stop_on:',
    '    - consequential_decision',
    '    - external_approval',
    '    - unrecoverable_blocker',
    '    - no_ready_work',
    'parallelism:',
    '  strategy: maximum_safe',
    '  max_concurrent_work_items: auto',
    '  max_concurrent_tasks_per_work_item: auto',
    'efficiency:',
    '  token_usage: optimize',
    '  prefer_primary_orchestrator: true',
    '  delegate_only_when_beneficial: true',
    ''
  );
  fs.mkdirSync(path.join(root, '.flow'), { recursive: true });
  fs.writeFileSync(configPath(root), lines.join('\n'), 'utf8');
}
