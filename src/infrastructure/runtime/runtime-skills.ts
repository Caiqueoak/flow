import fs from 'node:fs';
import path from 'node:path';

export interface RuntimeConfiguration {
  skills_path: string;
}

export function installRuntimeSkill(root: string, runtime: RuntimeConfiguration, packageRoot: string): string {
  ensureProjectLocalSkillsPath(runtime.skills_path);

  const target = path.join(root, runtime.skills_path, 'flow');
  ensureNoSymlinkInTargetPath(root, target);

  fs.rmSync(target, { recursive: true, force: true });
  copyDirectory(path.join(packageRoot, 'skills', 'flow'), target);

  return target;
}

function ensureProjectLocalSkillsPath(skillsPath: string): void {
  if (!skillsPath || path.isAbsolute(skillsPath) || skillsPath.split(/[\\/]/).includes('..')) {
    throw new Error('Runtime skills_path must remain project-local.');
  }
}

function ensureNoSymlinkInTargetPath(root: string, target: string): void {
  let ancestor = root;

  for (const segment of path.relative(root, target).split(path.sep)) {
    ancestor = path.join(ancestor, segment);

    if (fs.existsSync(ancestor) && fs.lstatSync(ancestor).isSymbolicLink()) {
      throw new Error('Refusing a symlinked runtime path.');
    }
  }

  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
    throw new Error('Refusing to overwrite a symlinked skill.');
  }
}

function copyDirectory(source: string, target: string): void {
  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}
