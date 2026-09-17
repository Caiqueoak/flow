# Flow architecture

## Architectural model

Flow uses a layered architecture at the macro level and command-oriented vertical slices in the application layer.

```text
presentation
     |
application
   /     \
domain   infrastructure
```

Dependency rules:

- `presentation` depends on `application`.
- `application` may orchestrate `domain` and `infrastructure`.
- `domain` does not depend on `presentation`, `application`, or `infrastructure`.
- `infrastructure` may depend on domain contracts when required, but never owns business rules.
- `shared` is allowed only for genuinely cross-cutting concepts with no natural owner.

## Ownership

| Location                                | Owns                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `src/presentation/cli/`                 | CLI bootstrap, parsing, command registry, dispatch, prompts and output  |
| `src/application/<command>/`            | One public root command and its application orchestration               |
| `src/application/<command>/commands/`   | Public subcommands with a literal 1:1 mapping to CLI tokens             |
| `src/application/<command>/operations/` | Private operations used to implement that command slice                 |
| `src/domain/<concept>/`                 | Domain models, rules, validation and schemas owned by the concept       |
| `src/infrastructure/`                   | Git, filesystem, persistence, projections, runtime assets and processes |
| `src/shared/`                           | Minimal cross-cutting errors/models with no natural owner               |

## Public API mapping

The source tree mirrors the CLI public surface.

```text
flow status
-> application/status/command.ts

flow task create
-> application/task/commands/create.ts

flow task commit
-> application/task/commands/commit.ts

flow work-item blocker-add
-> application/work-item/commands/blocker-add.ts
```

`commands/` has a strict meaning: every file represents an actual public subcommand. Internal implementation operations must not be placed there.

Flags are not commands. For example, while the interface is `flow migrate --plan|--apply`, planning and applying migration remain internal operations owned by `application/migrate/command.ts`. If the public API becomes `flow migrate plan|apply`, only then do those operations become files under `commands/`.

## Command definitions and dispatch

Command routing is declarative. Root commands and compound subcommands are represented as data rather than growing `if/else` or `switch` dispatch chains.

The canonical command definition is the SSOT for routing and, where practical, name, description, arguments, flags and help generation.

A root `command.ts` is application orchestration. It receives normalized invocation data, resolves a subcommand when applicable, and returns a command outcome. Presentation owns raw argv parsing, terminal rendering, prompts, and process exit state.

## Internal vocabulary

Use a small predictable structural vocabulary inside an owner:

- `commands/`: public subcommands only.
- `operations/`: private application or infrastructure operations.
- `models/`: interfaces, types, enums and DTO-like structures.
- `rules/`: deterministic domain rules.
- `validation/`: explicit validation.
- `mappers/`: representation transformations.
- `schemas/`: serialized/public contracts.
- `tests/`: tests owned by the capability or concept.
- `fixtures/`: test fixtures.

Do not create empty directories to satisfy the architecture. Add a directory only when cohesive code belongs there.

Avoid vague dumping grounds such as `utils`, `helpers`, `misc`, `common`, `services` and `managers`.

## Intent gradient

Code should reveal intent before mechanics:

```text
public behavior
-> orchestration
-> named operations
-> deterministic details
-> external mechanics
```

At orchestration boundaries prefer flows that read as `read -> validate -> transform -> decide -> write`.

## SSOT and sharing

SSOT means each piece of knowledge has one owner; it does not mean all contracts belong in one global file.

Before putting code in `shared`, identify its natural owner. `TaskId` belongs to the task domain, `WorkItemState` belongs to the work-item domain, and Git mechanics belong to infrastructure.

Promote code to shared scope only when ownership is genuinely cross-cutting and reuse is real.

## Transitional compatibility

During staged refactors, forwarding modules may temporarily preserve existing imports while ownership moves to its final layer. These modules do not own behavior and must be removed after their consumers migrate; they are migration scaffolding, not part of the target architecture.

## System boundaries

Filesystem, Git, external processes, runtime integrations and persistence are explicit infrastructure effects. Domain decisions stay pure whenever practical and must not be buried in infrastructure.

## Refactoring rule

Structural refactors are behavior-preserving by default. Prefer move -> validate -> refactor. Keep the repository buildable and testable at each meaningful step.
