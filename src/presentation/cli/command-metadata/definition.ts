export type {
  CommandArgument,
  CommandDefinition,
  CommandOption
} from '../../../application/command-definition.js';

/** @deprecated Convert command executors to CommandInvocation. */
export interface CommandContext {
  args: string[];
  packageRoot: string;
  packageName: string;
  version: string;
}
