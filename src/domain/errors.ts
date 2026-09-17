export class UserInputError extends Error {
  constructor(
    message: string,
    public readonly exitCode = 1
  ) {
    super(message);
    this.name = 'UserInputError';
  }
}
