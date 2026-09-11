import path from 'node:path';

export function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function projectRoot(args) {
  return path.resolve(valueAfter(args, '--path') || process.cwd());
}
