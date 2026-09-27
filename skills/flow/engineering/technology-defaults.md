# Technology-aware convention defaults

Use these as bounded defaults, not mandatory architecture templates. A deviation requires a concrete project reason.

## TypeScript / JavaScript

- source filenames: kebab-case unless framework tooling requires otherwise
- symbols: ecosystem-standard camelCase/PascalCase
- formatting: Prettier when compatible with the repository
- linting: ESLint
- type verification: `tsc --noEmit` for TypeScript
- tests: use the repository's established runner; prefer behavior-focused tests

## React

- organize by product capability when the application has multiple meaningful features
- keep component-local details close to the component; avoid a global `components/` dumping ground when feature ownership is clear
- hooks use `use*`; components use PascalCase symbols while filenames follow project filename convention
- do not introduce state libraries when local/server-state primitives are sufficient

## Node backend

- isolate external IO at explicit boundaries
- keep business behavior independent of transport/framework details where this materially improves testability or reuse
- do not add repository/service/interface layers solely to satisfy a pattern

## Python

- modules/files: snake_case
- classes: PascalCase; functions/variables: snake_case
- prefer Ruff for lint/format in new projects when compatible
- use pytest for tests when no established runner exists
- choose pyright/mypy only when static typing value justifies the project cost

## Java / Spring

- standard Java package/class naming
- constructor injection by default
- keep framework adapters from owning business rules when business rules are non-trivial
- use the project's Maven/Gradle verification lifecycle rather than duplicating checks

## Decision rule

When an existing mature repository has a clearly enforced convention, `preserve` may retain it. Under `incremental`, apply improved defaults proportionally to new/touched areas without incidental broad refactoring. Under `refactor`, apply the approved target engineering contract across the explicitly authorized refactor scope. Technology defaults never override an approved engineering.md.
