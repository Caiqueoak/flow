export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode = 1
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export function fail(message: string, exitCode = 1): never {
  throw new CliError(message, exitCode);
}

export function writeOutput(message = ''): void {
  console.log(message);
}
