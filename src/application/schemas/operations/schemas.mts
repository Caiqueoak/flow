import fs from 'node:fs';
import path from 'node:path';
import { JSON_SCHEMAS } from '../../../domain/project/schemas.js';
import { recordOutput as writeOutput } from '../../command-runtime.js';

interface SchemasCommandContext {
  packageRoot: string;
}

export function writeSchemas(target: string): void {
  fs.mkdirSync(target, { recursive: true });

  for (const [name, schema] of Object.entries(JSON_SCHEMAS)) {
    const schemaFile = path.join(target, `${name}.schema.json`);
    fs.writeFileSync(schemaFile, `${JSON.stringify(schema, null, 2)}\n`);
  }
}

export function runSchemas({ packageRoot }: SchemasCommandContext): void {
  writeSchemas(path.join(packageRoot, 'schemas'));
  writeOutput('Generated Flow JSON Schemas.');
}
