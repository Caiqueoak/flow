import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is unavailable.');
execFileSync(process.execPath, [npmCli, 'run', 'build'], { stdio: 'inherit' });
const output = execFileSync(process.execPath, ['dist/entry.js', '--help'], { encoding: 'utf8' });
if (!output.includes('flow doctor') && !output.includes('doctor')) throw new Error('Compiled CLI help is incomplete.');
for (const required of ['dist/entry.js', 'schemas/backlog.schema.json', 'skills/flow/SKILL.md'])
  if (!fs.existsSync(required)) throw new Error(`Package content missing ${required}.`);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-package-'));
fs.writeFileSync(path.join(temporary, 'verified'), 'compiled binary and package content verified');
fs.rmSync(temporary, { recursive: true, force: true });
