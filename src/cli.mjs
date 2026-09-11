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
  graph: async (context) => (await import('./commands/graph.mjs')).runGraph(context)
};

function help() {
  info(
    `Flow ${packageManifest.version}\n\nUsage:\n  flow init [--path <project>] [--runtime codex,claude]\n  flow update [--path <project>]\n  flow graph [--path <project>]\n  flow --version\n\nflow init creates only .flow/config.yaml and installs the project-local /flow skill for selected coding agents.\nIf .flow already exists, init only adds coding-agent integrations and exits without prompting when all built-in integrations are already configured.\nflow update updates the installation that provides the Flow CLI (project-local or global) and refreshes every configured project-local skill.\nflow graph deterministically projects .flow/BACKLOG.yaml into .flow/GRAPH.md. There is no flow install command and no automatic/background update mechanism.`
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
  } else {
    throw error;
  }
}
