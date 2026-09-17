---
id: flow/readability-first@2
label: Readability First v2 — Recommended
description: Stack-agnostic engineering defaults for readable, cohesive, strongly-typed and behavior-oriented code.
---

# Engineering Principles

## Core priorities

- Optimize for readability, maintainability, predictability, and simplicity.
- Prefer code that communicates intent without requiring the reader to mentally execute implementation details.
- Prefer the simplest design that satisfies current requirements; avoid cleverness, speculative abstractions, and unnecessary complexity.
- Optimize for both human developers and coding agents.

## Architecture

- Prefer vertical slices for application behavior. Organize by capabilities, features, commands, or use cases rather than technical layers inside the application surface.
- Keep behavior, policies, models, validation, and relevant tests close to the owning capability.
- Keep high cohesion inside a slice and low coupling between slices. Avoid cross-slice dependencies; promote the smallest stable contract or mechanism when reuse is real.
- Maintain a small shared kernel. Shared code is for genuinely reused mechanisms and shared domain concepts, never a dumping ground.

> Declarative at the domain and orchestration level, functional for deterministic transformations, imperative only at system boundaries.

Prefer flows that read as: `read -> validate -> transform -> decide -> write`. Do not mix those responsibilities into one block.

## Discoverability and public surfaces

- When software exposes named public operations — commands, routes, endpoints, jobs, actions, events, or handlers — structure implementation so those operations are easy to locate from their public names.
- Prefer a predictable mapping between public operation names and source modules when it reduces search cost.
- Public operations and internal implementation operations should be structurally distinguishable.
- Architecture should let a reader predict where code belongs before searching for it.

## Declarative dispatch

- Prefer declarative registries, maps, tables, or equivalent data-driven dispatch when selecting among a growing set of known operations.
- Avoid expanding `if/else` or `switch` dispatch chains when the mapping between an operation identifier and its handler can be represented directly as data.
- Reuse one canonical operation definition for routing, metadata, validation, documentation, and help when practical.

## Structural vocabulary

- Generic structural names such as `models`, `rules`, `operations`, `validation`, `mappers`, `schemas`, `tests`, and `fixtures` are useful when the parent already identifies the domain or capability.
- Prefer a small, consistent structural vocabulary over inventing different organizational terminology in every feature.
- Give each structural name strict semantics and use the same name for the same responsibility throughout the codebase.
- Do not organize by file count alone. Create directories around cohesive responsibilities, not merely to reduce the number of visible files.
- Avoid single-file folders without a semantic reason.
- Avoid vague containers such as `utils`, `helpers`, `misc`, `common`, `manager`, and `service` when a specific responsibility is available.

## Responsibilities and readability

- Apply SRP to functions, modules, components, and features: each has one clear primary responsibility and reason to change.
- Apply SSOT to states, schemas, rules, identifiers, defaults, constants, and contracts. Derive secondary representations from canonical definitions.
- Keep the happy path linear and easy to scan. Prefer guard clauses over deep nesting, meaningful whitespace over dense expressions, and named operations over inline complexity.
- Use domain-oriented names.
- Replace meaningful magic numbers, strings, states, limits, identifiers, paths, and patterns with named definitions.
- Order code by the reader's execution path: public handler or orchestrator first, then the operations it invokes in the order they are reached, then lower-level details.

## Intent before implementation

- Organize modules and functions so readers encounter intent before mechanics.
- Prefer the progression `public behavior -> orchestration -> named operations -> deterministic details -> external mechanics`.
- A reader should understand what the system does before needing to understand how lower-level work is performed.
- Use progressive disclosure of complexity: keep simple behavior simple and extract detail only when doing so reduces the context required to understand higher-level behavior.

## Functional core and system boundaries

- Prefer pure functions for deterministic parsing, mapping, validation, derivation, comparison, and state calculation. Separate decisions from effects and avoid hidden mutation.
- Keep filesystem, databases, network, external APIs, OS processes, Git, clocks, queues, and runtime APIs at explicit system boundaries.
- Boundary code is small and mechanical. Business behavior is never buried in infrastructure.
- Make system effects obvious from module ownership and imports.

## Types and contracts

- Use the strongest type system reasonably available. Explicitly type public APIs, commands, input and output boundaries, domain models, persisted structures, and external integrations.
- Let local inference stand when the type is obvious; represent important concepts explicitly rather than relying on generic primitives.
- Keep models with their owner unless they are genuinely reused. Keep command-specific constants local; place global contracts in explicitly named modules rather than generic shared folders.

## Owner-first sharing

- Before moving code into a shared location, identify whether the concept has a natural owner.
- Prefer an owner-local model, rule, constant, or schema over a generic shared equivalent when one domain or capability owns the knowledge.
- Promote code to shared scope only when reuse is real and ownership is genuinely cross-cutting.

## State, errors, and abstractions

- Make important state transitions explicit and centralize their rules. Prefer domain operations such as `startTask()` and `completeReview()` over generic mutation APIs when rules matter.
- Validate preconditions early and fail close to invalid input or state. Preserve consistency when operations with external effects fail; never swallow failures.
- Introduce abstractions only when they remove meaningful duplication, isolate a real boundary, express a domain concept, or measurably improve readability. Prefer simple composition; do not add factories, interfaces, adapters, repositories, wrappers, layers, or inheritance merely because a pattern suggests them.

## Entry points, tests, and refactoring

- Keep CLI handlers, controllers, endpoints, consumers, and jobs thin: interpret intent, validate basic boundary input, select behavior, invoke the owner, and present the result.
- Test observable behavior rather than implementation details. Keep tests close to the behavior they validate; pure logic needs independent tests and important boundaries need integration coverage.
- Prefer behavior-preserving structural refactors. Validate each meaningful step with type checks, tests, static analysis, formatting, packaging, and relevant platform-specific checks.

## Navigation test

A reader should be able to answer with minimal navigation:

- Where does this public operation enter?
- Where is its orchestration?
- Where are its business rules?
- Where are its models?
- Where do external effects happen?
- Where are its tests?

When multiple structures are valid, prefer the one that reduces search cost and requires less contextual knowledge.

## Decision rule

When multiple designs are valid, prefer the one that is easier to read, communicates domain intent, has fewer responsibilities, keeps related code closer, duplicates less knowledge, hides fewer effects, requires less context, is easier to test and modify safely, and introduces fewer unnecessary abstractions.
