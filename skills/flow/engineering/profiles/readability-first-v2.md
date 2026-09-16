---
id: flow/readability-first@2
label: Readability First v2 — Recommended
description: Stack-agnostic engineering defaults for readable, cohesive, strongly-typed and behavior-oriented code.
---

# Readability First v2

Use this profile only while synthesizing or explicitly revising `engineering.md`. Once approved, `engineering.md` is the project-specific source of truth.

## Agent objective

Optimize for code that is easy to locate, read, reason about, test and change safely. Prefer the simplest design that satisfies current requirements and stack conventions.

## Architecture

- Prefer vertical slices around capabilities, features, commands or use cases instead of organizing application behavior primarily by technical layer.
- Keep code that changes together close together. Favor high cohesion inside a slice and low coupling between slices.
- Keep a small shared kernel only for mechanisms or domain concepts with genuine, stable reuse.
- Start code inside the owning slice. Promote it to shared only after reuse is real and meaningful.
- Avoid cross-slice dependencies when a shared contract or mechanism is the clearer boundary.
- Adapt the physical layout to the language/framework. The profile defines principles, not mandatory folder names.

Use this design rule:

> Declarative at the domain and orchestration level, functional for deterministic transformations, imperative only at system boundaries.

Prefer flows that read as:

`read -> validate -> transform -> decide -> write`

## Responsibilities and knowledge

- Apply SRP: each function, type, module, component and feature should have one clear primary responsibility and reason to change.
- Apply SSOT: important states, schemas, rules, identifiers, defaults, constants and contracts should have one authoritative definition.
- Derive secondary representations from canonical definitions when the stack supports it instead of maintaining parallel copies.
- Make ownership and dependency direction explicit.

## Readability

- Prefer explicit, predictable code over cleverness, compression or brevity.
- A function should communicate what happens before forcing the reader to understand how it happens.
- Keep the happy path linear and easy to scan. Prefer guard clauses over deep nesting.
- Use meaningful whitespace and logical grouping. Avoid dense expressions, long inline chains and mixed abstraction levels.
- Prefer small cohesive functions when extraction names a real concept. Do not split code merely to reduce line count.
- Use semantic, domain-oriented names. Avoid vague dumping grounds such as `utils`, `helpers`, `misc`, `manager` or `service` when a specific responsibility can be named.

## Types and contracts

- Use the strongest type system reasonably available in the stack.
- Explicitly define important boundaries: public APIs, commands, inputs, outputs, domain models, persisted data and external integrations.
- Allow local inference when the type is obvious and an annotation would only add noise.
- Represent important domain concepts explicitly instead of relying excessively on generic primitives.
- Keep models/contracts close to the behavior that owns them unless they are genuinely shared.

## Constants and state

- Replace meaningful magic numbers, strings, states, limits, identifiers, paths and patterns with named definitions.
- Keep feature-specific constants close to the feature; keep only genuinely global values shared.
- Avoid giant global constants files.
- Make important state transitions explicit and centralize transition rules.

## Functional core and boundaries

- Prefer pure functions for deterministic parsing, mapping, validation, derivation, comparison and calculation.
- Separate decisions from side effects. Avoid hidden mutation and unexpected effects.
- Keep filesystem, database, network, external API, process execution, Git, clocks, queues and framework runtime APIs at explicit system boundaries.
- Boundary code should be small and mechanical; business behavior should not be buried in infrastructure code.

## Abstractions

- Prefer simple composition over inheritance and unnecessary indirection.
- Introduce an abstraction only when it removes meaningful duplication, isolates a real boundary, expresses a domain concept or measurably improves readability.
- Do not add interfaces, factories, adapters, repositories, wrappers or layers merely because a pattern suggests them.
- Defer speculative abstractions. Three clear lines are better than an abstraction that hides intent without paying for itself.

## Entry points

- Keep CLI handlers, controllers, endpoints, consumers and jobs thin.
- Entry points should parse intent, perform basic input validation, invoke the owning use case and present the result.
- Application behavior belongs in its vertical slice, not in the entry point.

## Errors and consistency

- Validate preconditions early and fail close to invalid input or state.
- Prefer clear domain-oriented failures; do not swallow errors.
- Preserve system consistency when an operation with external effects fails.

## Testing and refactoring

- Test observable behavior rather than implementation details when practical.
- Keep tests close to the behavior they validate when the ecosystem supports it.
- Pure deterministic logic should be independently testable; important external boundaries need integration coverage.
- Prefer behavior-preserving structural refactors and avoid mixing them with unrelated product changes.
- Validate meaningful refactors with the project tooling: build/type checks, tests, static analysis, formatting, package/release checks and relevant platform-specific checks.

## Decision order

When multiple designs are valid, prefer the one that:

1. is easier to read;
2. communicates domain intent more clearly;
3. has fewer responsibilities per unit;
4. keeps related code closer together;
5. duplicates less knowledge;
6. has fewer hidden side effects;
7. requires less context to understand;
8. is easier to test and change safely;
9. introduces fewer unnecessary abstractions.

## Agent review checklist

Before proposing the engineering contract or completing a code-quality review, check:

- Is behavior organized around clear capabilities/use cases?
- Is shared code genuinely shared?
- Are SRP, SSOT, cohesion and coupling reasonable?
- Are important boundaries and contracts explicit and appropriately typed?
- Are deterministic transformations separated from side effects?
- Are names, constants and state transitions obvious?
- Can the relevant behavior be understood without loading unrelated parts of the system?
- Did the design avoid speculative layers and stack-inappropriate ceremony?

Reconcile these defaults with the PRD, public contracts, security constraints, existing-code policy and idiomatic stack conventions. Document justified exceptions in `engineering.md`.
