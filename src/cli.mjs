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
  graph: async (context) => (await import('./commands/graph.mjs')).runGraph(context),
  status: async (context) => (await import('./commands/status.mjs')).runStatus(context),
  validate: async (context) => (await import('./commands/validate.mjs')).runValidate(context),
  route: async (context) => (await import('./commands/route.mjs')).runRoute(context),
  trace: async (context) => (await import('./commands/trace.mjs')).runTrace(context),
  migrate: async (context) => (await import('./commands/migrate.mjs')).runMigrate(context)
};

function help() {
  info(
    `Flow ${packageManifest.version}\n\nUse the project-local installation: npx --no-install flow <command>\n\nCommands:\n  init       Configure Flow and install/refresh local agent integrations.\n  migrate    Normalize older artifacts; /flow then reconciles legacy decisions.\n  status     Show progress and dependency/external blockers.\n  validate   Check schemas, approvals, DAGs, traceability and deterministic gates.\n  graph      Regenerate the derived work-item dependency graph.\n  route      Return the next repository-resumable agent step (--json available).\n  trace      Resolve W015-T003 to a HEAD-reachable commit with both Flow trailers.\n\nCommon options: --path <project>, --help, --version\ninit options: --runtime codex,claude --profile readability-first --existing-code improve|preserve\n  Readability First: reusable preferences for SRP, semantic naming, cohesion and simple vertical slices.\n  improve: recommend clearer structure while retaining behavior and external contracts.\n  preserve: retain consistent existing conventions unless a concrete problem warrants change.\n  Neither option authorizes refactoring; engineering changes require human approval.\nvalidate options: --json --pre-commit W015-T003\ntrace options: W015-T003 --json\n\nDiscovery → PRD approval → engineering approval → complete backlog → implementation-plan approval → serial implementation → review.\nUse /flow for agent workflows and engineering changes. Approved engineering.md is authoritative.\nUpdate the npm package with your package manager, then rerun init to refresh integrations.`
  );
}

export async function runCli(args = process.argv.slice(2)) {
  if (!args.length || args.includes('--help') || args.includes('-h')) return help();
  if (args.includes('--version') || args.includes('-v')) return info(packageManifest.version);
  const command = commands[args[0]];
  if (!command) throw new CliError(`unknown command '${args[0]}'. Run flow --help.`);
  return command({
    args: args.slice(1),
    packageRoot,
    packageName: packageManifest.name,
    version: packageManifest.version
  });
}

try {
  await runCli();
} catch (error) {
  if (error?.code === 'ABORT_ERR') {
    info('\nFlow command canceled.');
    process.exitCode = 130;
  } else if (error instanceof CliError) {
    console.error(`flow: ${error.message}`);
    process.exitCode = error.exitCode || 1;
  } else throw error;
}
