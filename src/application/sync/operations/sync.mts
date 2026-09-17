import { projectRoot, recordOutput as writeOutput } from '../../command-runtime.js';
import { syncProject } from '../../../infrastructure/projections/project.mjs';

interface SyncCommandContext {
  args: string[];
}

interface SyncResult {
  work_items: unknown[];
}

type SyncProject = (root: string) => SyncResult;

const syncProjectBoundary = syncProject as SyncProject;

export function runSync({ args }: SyncCommandContext): void {
  const result = syncProjectBoundary(projectRoot(args));
  writeOutput(
    `Synced ${result.work_items.length} generated work-item projection(s); canonical sources were not modified.`
  );
}
