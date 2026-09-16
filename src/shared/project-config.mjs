import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { FLOW_SCHEMA_VERSION } from '../domain/contracts.mjs';
import { READABILITY_FIRST_PROFILE } from './profiles.mjs';

export function configPath(root) {
  return path.join(root, '_flow', 'config.yaml');
}

export function defaultConfig(flowVersion = '0.6.0') {
  return {
    schema_version: FLOW_SCHEMA_VERSION,
    flow_version: flowVersion,
    runtimes: [],
    engineering: { profile: READABILITY_FIRST_PROFILE.id, existing_code_policy: 'not_applicable' }
  };
}

export function readConfig(root) {
  const file = configPath(root);
  if (!fs.existsSync(file)) return null;
  const raw = parse(fs.readFileSync(file, 'utf8')) ?? {};
  const config = defaultConfig();
  config.schema_version = raw.schema_version ?? 1;
  config.flow_version = raw.flow_version ?? null;
  config.runtimes = Array.isArray(raw.runtimes) ? raw.runtimes : [];
  config.engineering = { ...config.engineering, ...(raw.engineering ?? {}) };
  return config;
}

export function writeConfig(root, config) {
  const normalized = {
    schema_version: FLOW_SCHEMA_VERSION,
    flow_version: config.flow_version ?? defaultConfig().flow_version,
    runtimes: config.runtimes ?? [],
    engineering: {
      profile: config.engineering?.profile ?? defaultConfig().engineering.profile,
      existing_code_policy: config.engineering?.existing_code_policy ?? 'not_applicable'
    }
  };
  fs.mkdirSync(path.join(root, '_flow'), { recursive: true });
  fs.writeFileSync(configPath(root), stringify(normalized, { lineWidth: 0 }), 'utf8');
}
