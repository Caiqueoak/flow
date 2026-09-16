import path from 'node:path';
import { parse, stringify } from 'yaml';
import { loadWorkItems } from '../../artifacts/work-items.mjs';
import { fail } from '../../shared/cli-io.mjs';
import { SPEC_FILE } from '../../shared/domain/constants.js';
import type { LoadedWorkItem, WorkItemSpecMetadata } from '../../shared/domain/work-item.js';
import { readText, writeText } from '../../shared/filesystem/files.js';

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
