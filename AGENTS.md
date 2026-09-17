# Flow repository guide

## Architecture

- Presentation concerns live under `src/presentation/`; application commands live under `src/application/`.
- A public root command owns `src/application/<command>/command.ts` and its tests.
- Public subcommands map 1:1 to `src/application/<command>/commands/<token>.ts`; private mechanics belong in `operations/`.
- Domain rules and models live with `project`, `work-item`, `task`, `gate`, or `workflow` under `src/domain/`.
- Filesystem, Git, persistence, projections, processes, and runtime assets live under `src/infrastructure/`.

## Dependency direction

`presentation -> application -> domain/infrastructure`.

Domain never imports application, presentation, or infrastructure. Infrastructure may depend on domain contracts but never on application or presentation. Presentation owns raw CLI input, terminal output, prompts, and exit state.

## Code conventions

- Use TypeScript and NodeNext `.js` specifiers for local imports.
- Put orchestration before the helpers it calls; keep the happy path readable top to bottom.
- Prefer explicit owners over generic `shared`, `utils`, `helpers`, `core`, or `platform` folders.
- Application operations must not write terminal output or set process exit state.
- Do not add barrel files solely for convenience.

## Verification

Run `npm run verify` after structural changes. It is the single source of truth for
the local pre-push hook and development CI validation suite. Use Node 24.x (`nvm use`)
before running it. The published CLI supports Node 20.19.0 and later; CI verifies
that consumer contract from the generated tarball. Unit tests must import source
modules; only integration and package tests may depend on `dist/` after an explicit build.

Read `docs/architecture.md`, `docs/commands.md`, and `docs/testing.md` before changing module ownership.
