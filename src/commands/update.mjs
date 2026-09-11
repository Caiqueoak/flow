import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fail, info } from '../shared/cli-io.mjs';
import { readConfig } from '../shared/project-config.mjs';
import { projectRoot } from '../shared/project-path.mjs';
import { installRuntimeSkill } from '../shared/skill-installer.mjs';

function npmCommand() { return process.platform === 'win32' ? 'npm.cmd' : 'npm'; }
function runNpm(npmArgs, options = {}) {
  if (process.platform === 'win32') return execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', npmCommand(), ...npmArgs], options);
  return execFileSync(npmCommand(), npmArgs, options);
}
function packagePath(root, packageName) { return path.join(root, 'node_modules', ...packageName.split('/')); }
function containingNodeModules(packageRoot) {
  let current = path.resolve(packageRoot);
  while (true) {
    if (path.basename(current).toLowerCase() === 'node_modules') return current;
    const parent = path.dirname(current); if (parent === current) return null; current = parent;
  }
}
function installedPackageVersion(packageRoot) {
  const manifest = path.join(packageRoot, 'package.json');
  return fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')).version || null : null;
}
function lockedPackageVersion(root, packageName) {
  const lockfile = path.join(root, 'package-lock.json'); if (!fs.existsSync(lockfile)) return null;
  try { return JSON.parse(fs.readFileSync(lockfile, 'utf8')).packages?.[`node_modules/${packageName}`]?.version || null; } catch { return null; }
}
function globalUpdatePlan(root, packageRoot, packageName) {
  try {
    const globalNodeModules = path.resolve(runNpm(['root', '--global'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
    const globalPackageRoot = path.join(globalNodeModules, ...packageName.split('/'));
    if (path.resolve(packageRoot).startsWith(`${globalNodeModules}${path.sep}`) && fs.existsSync(path.join(globalPackageRoot, 'package.json'))) return { npmArgs: ['update', '--global', packageName], cwd: root, packageRoot: globalPackageRoot, mode: 'global' };
  } catch { /* local detection below */ }
  return null;
}
function updatePlan(root, packageRoot, packageName) {
  const global = globalUpdatePlan(root, packageRoot, packageName); if (global) return global;
  const nodeModules = containingNodeModules(packageRoot);
  if (nodeModules) return { npmArgs: ['update', packageName], cwd: path.dirname(nodeModules), packageRoot, mode: 'local' };
  const projectPackageRoot = packagePath(root, packageName);
  if (fs.existsSync(path.join(projectPackageRoot, 'package.json'))) return { npmArgs: ['update', packageName], cwd: root, packageRoot: projectPackageRoot, mode: 'project' };
  fail(`cannot determine how this Flow CLI was installed. Reinstall ${packageName} with npm, then run flow update again.`);
}
function repairDivergentProjectInstall(plan, packageName) {
  if (plan.mode === 'global') return;
  const expected = lockedPackageVersion(plan.cwd, packageName); const actual = installedPackageVersion(plan.packageRoot);
  if (!expected || !actual || expected === actual) return;
  const backup = path.join(plan.cwd, `.flow-update-backup-${process.pid}-${Date.now()}`);
  info(`Repairing divergent ${packageName} installation (${actual} on disk, ${expected} in package-lock.json)...`);
  fs.renameSync(plan.packageRoot, backup);
  try {
    runNpm(['install'], { cwd: plan.cwd, stdio: 'inherit' });
    if (installedPackageVersion(plan.packageRoot) !== expected) throw new Error(`npm install did not restore ${packageName}@${expected}.`);
    fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    try { fs.rmSync(plan.packageRoot, { recursive: true, force: true }); fs.renameSync(backup, plan.packageRoot); } catch { /* preserve npm error */ }
    throw error;
  }
}
export function runUpdate({ args, packageRoot, packageName }) {
  const root = projectRoot(args); const config = readConfig(root);
  if (!config) fail('this project is not initialized. Run flow init first.');
  if (!config.runtimes.length) fail('no coding agents are configured. Run flow init to add one.');
  const plan = updatePlan(root, packageRoot, packageName); info(`Updating ${packageName} (${plan.mode} installation)...`);
  try { repairDivergentProjectInstall(plan, packageName); runNpm(plan.npmArgs, { cwd: plan.cwd, stdio: 'inherit' }); }
  catch { fail('npm update failed. Existing project state and installed skills were not intentionally removed.'); }
  if (!fs.existsSync(path.join(plan.packageRoot, 'package.json'))) fail(`updated package not found at ${plan.packageRoot}.`);
  const latest = JSON.parse(fs.readFileSync(path.join(plan.packageRoot, 'package.json'), 'utf8'));
  for (const runtime of config.runtimes) info(`✓ ${runtime.type}: ${path.relative(root, installRuntimeSkill(root, runtime, plan.packageRoot))}`);
  info(`Flow updated to ${latest.version}. Project config does not duplicate the package version.`);
}
