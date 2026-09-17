import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

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

export async function promptSelect(input: { title: string; options: PromptOption[]; defaultIndex?: number }): Promise<string> {
  const defaultIndex = input.defaultIndex ?? 0;
  stdout.write(`${input.title}\n`);
  input.options.forEach((option, index) => stdout.write(`  ${index + 1}. ${option.label}\n`));
  return promptChoice(`Selection [${defaultIndex + 1}]: `, input.options, defaultIndex);
}

export async function promptMultiSelect(input: { title: string; options: PromptOption[] }): Promise<string[]> {
  stdout.write(`${input.title}\n`);
  input.options.forEach((option, index) => stdout.write(`  [ ] ${index + 1}. ${option.label}\n`));
  const interface_ = readline.createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const values = (await interface_.question('Selection: ')).split(',').map((value) => Number(value.trim()) - 1);
      if (values.length && values.every((value) => Number.isInteger(value) && input.options[value]))
        return [...new Set(values)].map((value) => input.options[value]!.value);
    }
  } finally {
    interface_.close();
  }
}

async function promptChoice(message: string, options: PromptOption[], defaultIndex: number): Promise<string> {
  const interface_ = readline.createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const value = (await interface_.question(message)).trim();
      const index = value ? Number(value) - 1 : defaultIndex;
      if (Number.isInteger(index) && options[index]) return options[index].value;
    }
  } finally {
    interface_.close();
  }
}
