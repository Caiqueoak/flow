import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDirectory, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const archiveArgument = process.argv[2];
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-package-'));

try {
  const archive = archiveArgument ? path.resolve(archiveArgument) : packPackage(temporary);
  const consumerRoot = path.join(temporary, 'consumer');
  fs.mkdirSync(consumerRoot);
  fs.writeFileSync(path.join(consumerRoot, 'package.json'), '{"private":true}\n');

  runNpm(['install', '--ignore-scripts', '--no-package-lock', archive], consumerRoot);

  const installedRoot = path.join(consumerRoot, 'node_modules', ...manifest.name.split('/'));
  const cli = path.join(installedRoot, 'dist', 'entry.js');
  assertCommand(cli, ['--version'], manifest.version);
  assertCommand(cli, ['--help'], 'doctor      Diagnose');
  assertCommand(cli, ['schemas'], 'Generated Flow JSON Schemas.');

  for (const required of ['dist/entry.js', 'schemas/backlog.schema.json', 'skills/flow/SKILL.md'])
    if (!fs.existsSync(path.join(installedRoot, required))) throw new Error(`Package content missing ${required}.`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

function packPackage(destination) {
  const output = runNpm(['pack', '--json', '--ignore-scripts', '--pack-destination', destination], packageRoot);
  const result = JSON.parse(output);
  const filename = result[0]?.filename;
  if (typeof filename !== 'string') throw new Error('npm pack did not return an archive filename.');
  return path.join(destination, filename);
}

function assertCommand(cli, args, expected) {
  const output = execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  if (!output.includes(expected))
    throw new Error(`flow ${args.join(' ')} did not include ${JSON.stringify(expected)}.`);
}

function runNpm(args, cwd) {
  if (process.platform !== 'win32') return execFileSync('npm', args, { cwd, encoding: 'utf8' });

  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('npm_execpath is unavailable on Windows.');
  return execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8' });
}
