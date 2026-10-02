import { parse, parseDocument, stringify } from 'yaml';
import { atomicWriteText, readText } from '../files.js';

export function writeYaml(file: string, value: unknown): void {
  atomicWriteText(file, stringify(value, { lineWidth: 0 }), { validate: validateYaml });
}

export function readYaml<T>(file: string): T {
  return parse(readText(file)) as T;
}

function validateYaml(text: string): void {
  const document = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors[0]?.message ?? 'Invalid YAML.');
}
