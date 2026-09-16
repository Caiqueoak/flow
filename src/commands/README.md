# Command ownership

Each directory owns one public `flow <command>` boundary. Keep command metadata in `definition.ts`, CLI adaptation in `handler.ts`, business operations in `usecases/`, and command tests in `tests/`.

Do not import another command slice. Reuse only explicitly named horizontal modules such as `artifacts`, `execution`, `flow-project`, or `environment`.
