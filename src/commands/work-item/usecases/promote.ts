import path from 'node:path';
import { SPEC_HEADINGS, validateSpec } from '../../../artifacts/work-item-specification.mjs';
import { fail } from '../../../cli/terminal/output.js';
import { SPEC_FILE } from '../../../contracts/constants.js';
import type { LoadedWorkItem } from '../../../contracts/work-item.js';
import { readText } from '../../../environment/filesystem.js';
import { editSpecMetadata } from '../work-item-context.js';

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
