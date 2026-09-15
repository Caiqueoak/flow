#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError, info } from './shared/cli-io.mjs';
import {
  commandByName,
  renderCommandHelp,
  renderGlobalHelp,
  validateCommandArguments
} from './cli/command-registry.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageManifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));

export async function runCli(args = process.argv.slice(2)) {
  if (!args.length || ['--help', '-h'].includes(args[0])) return info(renderGlobalHelp(packageManifest.version));
  if (['--version', '-v'].includes(args[0])) return info(packageManifest.version);
  const command = commandByName(args[0]);
  if (!command) throw new CliError(`unknown command '${args[0]}'. Run flow --help.`);
  if (args.slice(1).some((arg) => ['--help', '-h'].includes(arg))) return info(renderCommandHelp(command));
  try {
    validateCommandArguments(command, args.slice(1));
  } catch (error) {
    throw new CliError(error.message);
  }
  const module = await command.load();
  return module[command.run]({
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
