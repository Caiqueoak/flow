import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  commandByName,
  renderCommandHelp,
  renderGlobalHelp,
  validateCommandArguments
} from './command-metadata/registry.js';
import { CliError, writeOutput } from './terminal/output.js';
import type { CommandContext } from './command-metadata/definition.js';
import { captureCommandOutcome } from '../../application/command-runtime.js';
import { promptMultiSelect, promptSelect, promptText } from './terminal/prompts.js';

interface PackageManifest {
  name: string;
  version: string;
}

type CommandRunner = (context: CommandContext) => unknown | Promise<unknown>;

export async function runCli(args = process.argv.slice(2)): Promise<void> {
  const manifest = packageManifest();

  if (!args.length || ['--help', '-h'].includes(args[0] ?? '')) {
    writeOutput(renderGlobalHelp(manifest.version));
    return;
  }

  if (['--version', '-v'].includes(args[0] ?? '')) {
    writeOutput(manifest.version);
    return;
  }

  const command = commandByName(args[0] ?? '');
  if (!command) throw new CliError(`unknown command '${args[0]}'. Run flow --help.`);
  if (args.slice(1).some((argument) => ['--help', '-h'].includes(argument))) {
    writeOutput(renderCommandHelp(command));
    return;
  }

  validateCommandArguments(command, args.slice(1));
  const module = (await command.load()) as Record<string, unknown>;
  const run = module[command.run];
  if (typeof run !== 'function') throw new Error(`Command '${command.name}' has no runnable handler.`);

  const outcome = await captureCommandOutcome(
    () =>
      (run as CommandRunner)({
        args: args.slice(1),
        packageRoot: packageRoot(),
        packageName: manifest.name,
        version: manifest.version
      }),
    { text: promptText, select: promptSelect, multiSelect: promptMultiSelect }
  );
  if (outcome.kind === 'text') {
    for (const line of outcome.lines) writeOutput(line);
  } else {
    writeOutput(JSON.stringify(outcome.value, null, 2));
  }
  if (outcome.exitCode) process.exitCode = outcome.exitCode;
}

function packageManifest(): PackageManifest {
  return JSON.parse(fs.readFileSync(path.join(packageRoot(), 'package.json'), 'utf8')) as PackageManifest;
}

function packageRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));

  while (true) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error('Unable to locate Flow package root.');
    }

    current = parent;
  }
}
