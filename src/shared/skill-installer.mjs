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
  const target = path.join(root, runtime.skills_path, 'flow');
  copyDirectory(path.join(packageRoot, 'skills', 'flow'), target);
  return target;
}
