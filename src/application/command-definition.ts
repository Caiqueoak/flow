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

export interface CommandInvocation {
  positionals: readonly string[];
  options: ReadonlyMap<string, string | true>;
  projectRoot: string;
  packageRoot: string;
  packageName: string;
  version: string;
}

export type CommandOutcome =
  { kind: 'text'; lines: readonly string[]; exitCode?: number } | { kind: 'json'; value: unknown; exitCode?: number };

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

export const projectPathOption: CommandOption = {
  name: '--path',
  value: '<project>',
  description: 'Select project root (default: current directory).'
};
