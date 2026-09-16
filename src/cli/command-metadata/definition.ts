export interface CommandOption {
  name: string;
  value?: string;
  values?: readonly string[];
  default?: string;
  description?: string;
}

export interface CommandArgument {
  name: string;
  required?: boolean;
  description?: string;
}

export interface CommandContext {
  args: string[];
  packageRoot: string;
  packageName: string;
  version: string;
}

export interface CommandDefinition {
  name: string;
  description: string;
  usage: string;
  arguments?: readonly CommandArgument[];
  flags?: readonly CommandOption[];
  effects: string;
  when: string;
  hidden?: boolean;
  load: () => Promise<Record<string, unknown>>;
  run: string;
}
