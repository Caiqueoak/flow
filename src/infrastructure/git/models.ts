export type ProcessEnvironment = NodeJS.ProcessEnv;

export interface GitCommitInput {
  root: string;
  subject: string;
  body?: string;
  env?: ProcessEnvironment;
}

export interface TemporaryGitIndex {
  directory: string;
  env: ProcessEnvironment;
}
