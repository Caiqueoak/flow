import { runCli } from './dispatch-command.js';
import { writeOutput } from './terminal/output.js';
import { UserInputError } from '../../domain/errors.js';

try {
  await runCli();
} catch (error) {
  if (isPromptAbort(error)) {
    writeOutput('\nFlow command canceled.');
    process.exitCode = 130;
  } else if (error instanceof UserInputError) {
    console.error(`flow: ${error.message}`);
    process.exitCode = error.exitCode;
  } else {
    throw error;
  }
}

function isPromptAbort(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ABORT_ERR';
}
