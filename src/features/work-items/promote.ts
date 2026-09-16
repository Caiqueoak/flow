import path from 'node:path';
import { SPEC_HEADINGS, validateSpec } from '../../artifacts/spec.mjs';
import { fail } from '../../shared/cli-io.mjs';
import { SPEC_FILE } from '../../shared/domain/constants.js';
import type { LoadedWorkItem } from '../../shared/domain/work-item.js';
import { readText } from '../../shared/filesystem/files.js';
import { editSpecMetadata } from './shared.js';

export function promoteWorkItem(item: LoadedWorkItem): void {
  const specFile = path.join(item.base, SPEC_FILE);
  const result = validateSpec(readText(specFile), { expectedWorkItem: item.id });
  const bodyHeadings = new Set(result.body.split(/\r?\n/));
  const missingHeadings = SPEC_HEADINGS.filter((heading: string) => !bodyHeadings.has(heading));
  const errors = [...result.errors, ...missingHeadings];

  if (errors.length) {
    fail(`${item.id} spec is insufficient: ${errors.join(', ')}`);
  }

  editSpecMetadata(item, (metadata) => {
    metadata.maturity = 'ready';
  });
}
