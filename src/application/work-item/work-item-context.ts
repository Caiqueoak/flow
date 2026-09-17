import path from 'node:path';
import { parse, stringify } from 'yaml';
import { loadWorkItems } from '../../flow-project/work-items.mjs';
import { fail } from '../../presentation/cli/terminal/output.js';
import { SPEC_FILE } from '../../domain/project/project.js';
import type { LoadedWorkItem, WorkItemSpecMetadata } from '../../domain/work-item/work-item.js';
import { readText, writeText } from '../../infrastructure/filesystem/index.js';

export function loadProjectWorkItems(root: string): LoadedWorkItem[] {
  return loadWorkItems(root) as LoadedWorkItem[];
}

export function findWorkItem(root: string, id: string | undefined): LoadedWorkItem {
  const item = loadProjectWorkItems(root).find((candidate) => candidate.id === id);

  if (!item) {
    fail(`Unknown work-item '${id}'.`);
  }

  return item!;
}

export function editSpecMetadata(item: LoadedWorkItem, mutate: (metadata: WorkItemSpecMetadata) => void): void {
  const specFile = path.join(item.base, SPEC_FILE);
  const text = readText(specFile);
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const frontmatter = match?.[1];

  if (!match || frontmatter === undefined) {
    fail(`${item.id} spec requires YAML frontmatter.`);
  }

  const metadata = parse(frontmatter!) as WorkItemSpecMetadata;
  mutate(metadata);

  writeText(specFile, `---\n${stringify(metadata).trimEnd()}\n---${text.slice(match![0].length)}`);
}
