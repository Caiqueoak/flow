import { readFileSync } from 'node:fs';

const configuredVersion = readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim();
const requiredMajor = configuredVersion.match(/^([0-9]+)/)?.[1];
const currentMajor = process.versions.node.split('.')[0];

if (!requiredMajor || currentMajor !== requiredMajor) {
  console.error(`Flow development requires Node ${configuredVersion || '24.x'}; found ${process.version}.`);
  process.exitCode = 1;
}
