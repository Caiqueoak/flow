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
  const installedManifest = JSON.parse(fs.readFileSync(path.join(installedRoot, 'package.json'), 'utf8'));
  const cli = path.join(installedRoot, 'dist', 'entry.js');
  assertCommand(cli, ['--version'], manifest.version);
  assertCommand(cli, ['--help'], 'doctor      Diagnose');
  assertCommand(cli, ['schemas'], 'Generated Flow JSON Schemas.');
  assertBin(installedManifest, consumerRoot);

  for (const required of [
    'dist/entry.js',
    'schemas/backlog.schema.json',
    'skills/flow/SKILL.md',
    'skills/flow/core/orchestration.md'
  ])
    if (!fs.existsSync(path.join(installedRoot, required))) throw new Error(`Package content missing ${required}.`);

  assertW6OrchestrationContract(installedRoot);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

function packPackage(destination) {
  const output = runNpm(['pack', '--json', '--ignore-scripts', '--pack-destination', destination], packageRoot);
  const result = JSON.parse(output);
  const packed = Array.isArray(result) ? result[0] : (result[manifest.name] ?? Object.values(result)[0]);
  const filename = packed?.filename;
  if (typeof filename !== 'string') throw new Error('npm pack did not return an archive filename.');
  return path.join(destination, filename);
}

function assertBin(installedManifest, consumerRoot) {
  if (installedManifest.bin?.flow !== 'dist/entry.js')
    throw new Error('Published package is missing the flow CLI bin.');

  const binDirectory = path.join(consumerRoot, 'node_modules', '.bin');
  const executable = path.join(binDirectory, process.platform === 'win32' ? 'flow.cmd' : 'flow');
  if (!fs.existsSync(executable)) throw new Error('Installed package did not create the flow CLI executable.');
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


function assertW6OrchestrationContract(installedRoot) {
  const orchestration = fs.readFileSync(path.join(installedRoot, 'skills/flow/core/orchestration.md'), 'utf8');

  const requiredFragments = [
    'genuinely simple and bounded',
    'non-simple implementation must block/defer',
    'Never silently implement non-simple work directly',
    'Objective — one observable outcome sentence',
    'Repository state — exact repository plus work-item/task state',
    'Ownership — task/work-item ID and owned change surface',
    'Read-first references',
    'Scope/non-goals',
    'Relevant constraints',
    'Acceptance criteria',
    'Verification',
    'Stop/escalate conditions',
    'Output contract',
    'completed | blocked | needs_escalation',
    'durable handoff reference',
    'cheapest historically capable runtime-resolved option',
    'missing_context',
    'worker_quality',
    'integration_conflict',
    'scope_leak',
    'verification_gap',
    'orchestration_error',
    'there is no fixed worker count',
    'no one-worker-per-task rule',
    'Use W5 review passes/findings/resolutions as empirical feedback'
  ];

  for (const fragment of requiredFragments) {
    if (!orchestration.includes(fragment)) throw new Error(`W6 orchestration contract missing ${JSON.stringify(fragment)}.`);
  }

  for (const capability of [
    'spawnWorkers',
    'workerModelOverride',
    'workerEffortOverride',
    'contextModes',
    'workspaceIsolation',
    'concurrency',
    'usageTelemetry',
    'runtimeVersion',
    'surface'
  ]) {
    if (!orchestration.includes(`\`${capability}\``)) throw new Error(`W6 capability contract missing ${capability}.`);
  }

  if (/\b(?:claude|codex|gpt|gemini)\b/i.test(orchestration))
    throw new Error('W6 orchestration skill must not hard-code vendor or model policy.');
}
