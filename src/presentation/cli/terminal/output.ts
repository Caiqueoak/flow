import { UserInputError } from '../../../domain/errors.js';

export class CliError extends UserInputError {
  constructor(message: string, exitCode = 1) {
    super(message, exitCode);
    this.name = 'CliError';
  }
}

export function fail(message: string, exitCode = 1): never {
  throw new CliError(message, exitCode);
}

export function writeOutput(message = ''): void {
  console.log(message);
}
