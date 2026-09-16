// @ts-nocheck
import { writeOutput } from '../../../cli/terminal/output.js';
import { projectRoot } from '../../../cli/command-input/project-root.js';
import { syncProject } from '../../../flow-project/projections.mjs';

export function runSync({ args }) {
  const result = syncProject(projectRoot(args));
  writeOutput(
    `Synced ${result.work_items.length} generated work-item projection(s); canonical sources were not modified.`
  );
}
