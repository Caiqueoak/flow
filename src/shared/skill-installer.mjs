import fs from 'node:fs';
import path from 'node:path';

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(sourcePath, targetPath);
    else fs.copyFileSync(sourcePath, targetPath);
  }
}

export function installRuntimeSkill(root, runtime, packageRoot) {
  if (
    typeof runtime.skills_path !== 'string' ||
    !runtime.skills_path ||
    path.isAbsolute(runtime.skills_path) ||
    runtime.skills_path.split(/[\\/]/).includes('..')
  )
    throw new Error('Runtime skills_path must remain project-local.');
  const target = path.join(root, runtime.skills_path, 'flow');
  let ancestor = root;
  for (const segment of path.relative(root, target).split(path.sep)) {
    ancestor = path.join(ancestor, segment);
    if (fs.existsSync(ancestor) && fs.lstatSync(ancestor).isSymbolicLink())
      throw new Error('Refusing a symlinked runtime path.');
  }
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())
    throw new Error('Refusing to overwrite a symlinked skill.');
  fs.rmSync(target, { recursive: true, force: true });
  copyDirectory(path.join(packageRoot, 'skills', 'flow'), target);
  return target;
}
