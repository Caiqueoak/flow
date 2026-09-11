import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';

export function configPath(root) {
  return path.join(root, '.flow', 'config.yaml');
}

export function defaultConfig() {
  return {
    schema_version: 2,
    runtimes: [],
    engineering: { profile: 'pragmatic', brownfield_policy: 'rebaseline' },
    autonomy: {
      continue_across_work_items: true,
      stop_on: ['consequential_decision', 'external_action', 'unrecoverable_blocker', 'finished']
    },
    parallelism: {
      strategy: 'maximum_safe',
      mutating_tasks: 'isolated_worktrees_only'
    }
  };
}

export function readConfig(root) {
  const file = configPath(root);
  if (!fs.existsSync(file)) return null;
  const raw = parse(fs.readFileSync(file, 'utf8')) ?? {};
  const config = defaultConfig();
  config.schema_version = raw.schema_version ?? 1;
  config.runtimes = Array.isArray(raw.runtimes) ? raw.runtimes : [];
  config.engineering = { ...config.engineering, ...(raw.engineering ?? {}) };
  config.autonomy = { ...config.autonomy, ...(raw.autonomy ?? {}) };
  config.parallelism = { ...config.parallelism, ...(raw.parallelism ?? {}) };
  return config;
}

export function writeConfig(root, config) {
  const normalized = {
    schema_version: 2,
    runtimes: config.runtimes ?? [],
    engineering: { ...defaultConfig().engineering, ...(config.engineering ?? {}) },
    autonomy: { ...defaultConfig().autonomy, ...(config.autonomy ?? {}) },
    parallelism: { ...defaultConfig().parallelism, ...(config.parallelism ?? {}) }
  };
  fs.mkdirSync(path.join(root, '.flow'), { recursive: true });
  fs.writeFileSync(configPath(root), stringify(normalized, { lineWidth: 0 }), 'utf8');
}
