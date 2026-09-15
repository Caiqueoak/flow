import fs from 'node:fs';
import path from 'node:path';
import { JSON_SCHEMAS } from '../domain/contracts.mjs';
import { info } from '../shared/cli-io.mjs';

export function writeSchemas(target) {
  fs.mkdirSync(target, { recursive: true });
  for (const [name, schema] of Object.entries(JSON_SCHEMAS))
    fs.writeFileSync(path.join(target, `${name}.schema.json`), `${JSON.stringify(schema, null, 2)}\n`);
}

export function runSchemas({ packageRoot }) {
  writeSchemas(path.join(packageRoot, 'schemas'));
  info('Generated Flow JSON Schemas.');
}
