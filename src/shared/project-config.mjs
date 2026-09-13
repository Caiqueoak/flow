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
    engineering: { profile: 'flow/readability-first@1', existing_code_policy: 'not_applicable' }
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
  return config;
}

export function writeConfig(root, config) {
  const normalized = {
    schema_version: 2,
    runtimes: config.runtimes ?? [],
    engineering: {
      profile: config.engineering?.profile ?? defaultConfig().engineering.profile,
      existing_code_policy: config.engineering?.existing_code_policy ?? 'not_applicable'
    }
  };
  fs.mkdirSync(path.join(root, '.flow'), { recursive: true });
  fs.writeFileSync(configPath(root), stringify(normalized, { lineWidth: 0 }), 'utf8');
}
