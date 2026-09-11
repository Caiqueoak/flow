#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError, info } from './shared/cli-io.mjs';

const currentFile = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(currentFile), '..');
const packageManifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const commands = {
  init: async (context) => (await import('./commands/init.mjs')).runInit(context),
  update: async (context) => (await import('./commands/update.mjs')).runUpdate(context),
  graph: async (context) => (await import('./commands/graph.mjs')).runGraph(context),
  status: async (context) => (await import('./commands/status.mjs')).runStatus(context),
  validate: async (context) => (await import('./commands/validate.mjs')).runValidate(context),
  route: async (context) => (await import('./commands/route.mjs')).runRoute(context),
  trace: async (context) => (await import('./commands/trace.mjs')).runTrace(context),
  migrate: async (context) => (await import('./commands/migrate.mjs')).runMigrate(context),
  gates: async (context) => (await import('./commands/gates.mjs')).runGates(context)
};

function help() {
  info(`Flow ${packageManifest.version}\n\nUsage:\n  flow init [--path <project>] [--runtime codex,claude] [--profile pragmatic|strict|prototype] [--brownfield rebaseline|preserve]\n  flow update [--path <project>]\n  flow migrate [--path <project>]\n  flow validate [--path <project>] [--json] [--pre-commit W015-T003]\n  flow route [--path <project>] [--json]\n  flow status [--path <project>]\n  flow gates [--path <project>] [--json]\n  flow graph [--path <project>]\n  flow trace W015-T003 [--path <project>] [--json]\n  flow --version\n\nflow init creates/updates only .flow/config.yaml and project-local runtime integrations.\nThe first /flow invocation establishes an approved engineering contract before implementation.\nReady/Blocked are derived from the dependency DAG; persisted lifecycle state is pending, in_progress, or completed.\nTask implementation identity is the Flow-Task Git trailer; commit SHA is derived with flow trace.`);
}

export async function runCli(args = process.argv.slice(2)) {
  if (!args.length || args.includes('--help') || args.includes('-h')) return help();
  if (args.includes('--version') || args.includes('-v')) return info(packageManifest.version);
  const command = commands[args[0]];
  if (!command) throw new CliError(`unknown command '${args[0]}'. Run flow --help.`);
  return command({ args: args.slice(1), packageRoot, packageName: packageManifest.name, version: packageManifest.version });
}

try { await runCli(); }
catch (error) {
  if (error?.code === 'ABORT_ERR') { info('\nFlow command canceled.'); process.exitCode = 130; }
  else if (error instanceof CliError) { console.error(`flow: ${error.message}`); process.exitCode = error.exitCode || 1; }
  else throw error;
}
