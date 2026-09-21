import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { FLOW_SCHEMA_VERSION } from '../../domain/project/project.js';
import { READABILITY_FIRST_PROFILE } from '../runtime/engineering-profiles.js';

export interface RuntimeConfiguration {
  type: string;
  skills_path: string;
}

export interface FlowConfiguration {
  schema_version: number;
  flow_version: string | null;
  runtimes: RuntimeConfiguration[];
  engineering: { profile: string; existing_code_policy: string };
}

export function configPath(root: string): string {
  return path.join(root, '_flow', 'config.yaml');
}

export function defaultConfig(flowVersion = '0.6.0'): FlowConfiguration {
  return {
    schema_version: FLOW_SCHEMA_VERSION,
    flow_version: flowVersion,
    runtimes: [],
    engineering: { profile: READABILITY_FIRST_PROFILE.id, existing_code_policy: 'not_applicable' }
  };
}

export function readConfig(root: string): FlowConfiguration | null {
  const file = configPath(root);
  if (!fs.existsSync(file)) return null;
  const raw = asRecord(parse(fs.readFileSync(file, 'utf8')));
  const config = defaultConfig();
  config.schema_version = typeof raw.schema_version === 'number' ? raw.schema_version : 1;
  config.flow_version = typeof raw.flow_version === 'string' ? raw.flow_version : null;
  config.runtimes = Array.isArray(raw.runtimes) ? (raw.runtimes as RuntimeConfiguration[]) : [];
  config.engineering = { ...config.engineering, ...asRecord(raw.engineering) } as FlowConfiguration['engineering'];
  return config;
}

export function writeConfig(root: string, config: FlowConfiguration): void {
  const normalized = {
    schema_version: FLOW_SCHEMA_VERSION,
    flow_version: config.flow_version ?? defaultConfig().flow_version,
    runtimes: config.runtimes ?? [],
    engineering: {
      profile: config.engineering?.profile ?? defaultConfig().engineering.profile,
      existing_code_policy: normalizeExistingCodePolicy(config.engineering?.existing_code_policy)
    }
  };
  fs.mkdirSync(path.join(root, '_flow'), { recursive: true });
  fs.writeFileSync(configPath(root), stringify(normalized, { lineWidth: 0 }), 'utf8');
}

function normalizeExistingCodePolicy(value: string | undefined): string {
  return value === 'improve' ? 'incremental' : (value ?? 'not_applicable');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
