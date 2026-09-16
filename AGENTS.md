# Flow repository guide

## Architecture

- A public CLI command owns `src/commands/<command>/`.
- `definition.ts` describes the public command, `handler.ts` orchestrates it, and `usecases/` holds named command operations.
- Keep command tests in `src/commands/<command>/tests/`.
- Shared behavior uses concrete roots only: `contracts`, `artifacts`, `execution`, `flow-project`, `package-assets`, and `environment`.
- Keep tests for those roots in their own `tests/` directory.

## Dependency direction

`cli -> commands -> flow-project/artifacts/execution/contracts`.

`flow-project` may use `environment`; `environment` only talks to Node and external programs. No horizontal module may import `cli` or `commands`.

## Code conventions

- Use TypeScript and NodeNext `.js` specifiers for local imports.
- Put orchestration before the helpers it calls; keep the happy path readable top to bottom.
- Prefer explicit names over generic `shared`, `utils`, `helpers`, `core`, `domain`, or `platform` folders.
- A use case must not parse raw CLI arguments, write terminal output, or set an exit code.
- Do not add barrel files solely for convenience.

## Verification

Run `npm run verify` after structural changes. It is the single source of truth for
the local pre-push hook and development CI validation suite. Use Node 24.x (`nvm use`)
before running it. The published CLI supports Node 20.19.0 and later; CI verifies
that consumer contract from the generated tarball. Unit tests must import source
modules; only integration and package tests may depend on `dist/` after an explicit build.

Read `docs/architecture.md`, `docs/commands.md`, and `docs/testing.md` before changing module ownership.
