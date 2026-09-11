import readline from 'node:readline/promises';
import { stdin as inputStream, stdout as outputStream } from 'node:process';

export class CliError extends Error {}

export function fail(message, code = 1) {
  const error = new CliError(message);
  error.exitCode = code;
  throw error;
}

export function info(message = '') {
  console.log(message);
}

function abortedPromptError() {
  const error = new Error('Prompt aborted.');
  error.code = 'ABORT_ERR';
  return error;
}

function question(readlineInterface, message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      readlineInterface.removeListener('close', onClose);
      callback(value);
    };
    const onClose = () => finish(reject, abortedPromptError());
    readlineInterface.once('close', onClose);
    readlineInterface.question(message).then(
      (answer) => finish(resolve, answer),
      (error) => finish(reject, error)
    );
  });
}

export async function promptText(message, defaultValue = '') {
  const readlineInterface = readline.createInterface({ input: inputStream, output: outputStream });
  try {
    const answer = (
      await question(readlineInterface, `${message}${defaultValue ? ` [${defaultValue}]` : ''}: `)
    ).trim();
    return answer || defaultValue;
  } finally {
    readlineInterface.close();
  }
}

export async function promptMultiSelect({ title, options }) {
  info(title);
  options.forEach((option, index) => info(`  [ ] ${index + 1}. ${option.label}`));
  info('  (Select multiple with comma-separated numbers, e.g. 1,2)');
  const readlineInterface = readline.createInterface({ input: inputStream, output: outputStream });
  try {
    while (true) {
      const answer = (await question(readlineInterface, 'Selection: ')).trim();
      const indices = [
        ...new Set(
          answer
            .split(',')
            .map((value) => Number.parseInt(value.trim(), 10))
            .filter(Number.isInteger)
        )
      ];
      if (indices.length && indices.every((index) => index >= 1 && index <= options.length)) {
        return indices.map((index) => options[index - 1].value);
      }
      info('Choose one or more valid numbers.');
    }
  } finally {
    readlineInterface.close();
  }
}
