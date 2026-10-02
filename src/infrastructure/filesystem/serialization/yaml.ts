import { parse, parseDocument, stringify } from 'yaml';
import { atomicWriteText, readText } from '../files.js';

export function writeYaml(file: string, value: unknown): void {
  atomicWriteText(file, stringify(value, { lineWidth: 0 }), {
    validate: (candidate) => {
      const document = parseDocument(candidate, { prettyErrors: false, uniqueKeys: true });
      if (document.errors.length)
        throw new Error(`Generated YAML is invalid: ${document.errors[0]?.message ?? 'unknown YAML error'}`);
    }
  });
}

export function readYaml<T>(file: string): T {
  return parse(readText(file)) as T;
}
