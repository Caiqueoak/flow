# Commands

Flow is CLI-first. The application source tree mirrors the public command surface.

## Root commands

Every public `flow <command>` owns `src/application/<command>/command.ts`.

Supported root commands are `init`, `doctor`, `migrate`, `status`, `validate`, `route`, `sync`, `trace`, `gates`, `work-item`, `task`, `approval`, `scope`, and `schemas`.

## Public subcommands

Actual CLI subcommands live under `src/application/<command>/commands/` and the filename matches the CLI token exactly.

Examples:

```text
flow task create      -> application/task/commands/create.ts
flow task set         -> application/task/commands/set.ts
flow task start       -> application/task/commands/start.ts
flow task commit      -> application/task/commands/commit.ts

flow work-item create          -> application/work-item/commands/create.ts
flow work-item blocker-add     -> application/work-item/commands/blocker-add.ts
flow work-item review-complete -> application/work-item/commands/review-complete.ts
```

A file under `commands/` must correspond to a public CLI command. Private implementation behavior belongs under `operations/` or another responsibility-specific internal folder.

## Flags

Flags do not create command modules. `flow migrate --plan|--apply` remains one root command until `plan` and `apply` become real CLI subcommands.

## Dispatch

Root and local command dispatch should be declarative. Prefer command registries/maps over conditional routing chains. The command definition should be the SSOT for routing and help metadata where practical.
