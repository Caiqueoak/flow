# ADR 002 — Layered architecture with CLI-mirrored command slices

## Status

Accepted.

## Context

The previous topology grouped command slices under `src/commands` while domain knowledge and effects were split horizontally across `contracts`, `artifacts`, `execution`, `flow-project`, `environment`, and `package-assets`. This made command entry points discoverable but forced readers to traverse several generic owners to understand one behavior.

Flow is CLI-first, so public command discoverability should remain a first-class property while domain ownership and external effects become explicit.

## Decision

Use macro layers:

```text
presentation -> application -> domain
                     \
                      -> infrastructure
```

Organize `application` by public root command.

A root command owns `application/<command>/command.ts`.

Actual public subcommands live under `application/<command>/commands/`, with filenames matching CLI tokens exactly. Internal application behavior belongs under `operations/` or another responsibility-specific internal folder.

Command routing uses declarative registries rather than growing conditional chains.

Domain concepts own their models, rules, validation, identifiers, states, and schemas. Infrastructure owns Git, filesystem, persistence, projections, runtime assets, and process effects. Shared code remains minimal and ownerless by definition.

## Consequences

- The source tree mirrors the public CLI and reduces search cost.
- `commands/` gains a strict, mechanically understandable meaning.
- SSOT is owner-local rather than concentrated in global contract files.
- Horizontal dumping grounds can be removed incrementally.
- Architecture can be checked with static dependency rules.
- Structural migration must be behavior-preserving and staged to keep the repository buildable.
