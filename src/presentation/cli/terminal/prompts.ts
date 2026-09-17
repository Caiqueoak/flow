import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { writeOutput } from './output.js';

export interface PromptOption {
  label: string;
  value: string;
  description?: string;
}

export async function promptText(message: string, defaultValue = ''): Promise<string> {
  const interface_ = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await interface_.question(`${message}${defaultValue ? ` [${defaultValue}]` : ''}: `)).trim();
    return answer || defaultValue;
  } finally {
    interface_.close();
  }
}

export async function promptSelect(input: {
  title: string;
  options: PromptOption[];
  defaultIndex?: number;
}): Promise<string> {
  const defaultIndex = input.defaultIndex ?? 0;
  writeOutput(input.title);
  input.options.forEach((option, index) =>
    writeOutput(
      `  ${index === defaultIndex ? '›' : ' '} ${index + 1}. ${option.label}${option.description ? `\n     ${option.description}` : ''}`
    )
  );
  const interface_ = readline.createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const answer = (await interface_.question(`Selection [${defaultIndex + 1}]: `)).trim();
      const index = answer ? Number.parseInt(answer, 10) - 1 : defaultIndex;
      if (Number.isInteger(index) && index >= 0 && index < input.options.length) return input.options[index]!.value;
      writeOutput('Choose a valid number.');
    }
  } finally {
    interface_.close();
  }
}

export async function promptMultiSelect(input: { title: string; options: PromptOption[] }): Promise<string[]> {
  writeOutput(input.title);
  input.options.forEach((option, index) => writeOutput(`  [ ] ${index + 1}. ${option.label}`));
  writeOutput('  (Select multiple with comma-separated numbers, e.g. 1,2)');
  const interface_ = readline.createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const answer = (await interface_.question('Selection: ')).trim();
      const indices = [
        ...new Set(
          answer
            .split(',')
            .map((value) => Number.parseInt(value.trim(), 10))
            .filter(Number.isInteger)
        )
      ];
      if (indices.length && indices.every((index) => index >= 1 && index <= input.options.length))
        return indices.map((index) => input.options[index - 1]!.value);
      writeOutput('Choose one or more valid numbers.');
    }
  } finally {
    interface_.close();
  }
}
