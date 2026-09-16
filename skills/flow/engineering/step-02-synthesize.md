# Engineering — recommend a contract

Read the approved PRD, config, full existing engineering evidence, repository tooling/contracts and technology-defaults.md. Resolve the exact engineering profile selected by config before drafting:

- `flow/readability-first@2` -> `profiles/readability-first-v2.md`
- `flow/readability-first@1` -> `profiles/readability-first.md`

Use the selected profile as defaults, not as text to copy mechanically. Materialize stack-idiomatic paths, boundaries, naming, contracts and verification rules for this project. `improve` may critique accidental structure while preserving behavior; `preserve` gives consistent existing conventions stronger weight. Neither policy authorizes refactoring by itself.

Recommend a complete but proportional technical contract. Keep global product behavior in the PRD and bounded delivery behavior in work-item specs; engineering records only the technical/code/infra constraints that realize them.

Frontmatter:

- `schema_version: 1`
- `status: draft`
- `baseline.profile`: exact versioned profile id selected in config
- `baseline.existing_code_policy: improve|preserve|not_applicable`

Include exact headings:

# Engineering

## System shape

## Modules and ownership

## Dependency direction and boundaries

## Vertical slices and code organization

## Naming and readability conventions

## Data ownership and persistence

## Error handling

## Testing and verification

## Dependencies and external services

## Security and operations

## Deterministic gates

## Deferred complexity

## Exceptions

Materialize concrete paths, responsibilities, dependency direction, naming examples, type/contract conventions, tests and justified exceptions. Explicitly state not applicable/deferred areas and why. Review SRP, SSOT, low coupling/high cohesion, behavior-oriented vertical slices, proximity, readability, deterministic core vs side effects, type boundaries, named constants and complexity ROI. Do not mandate ceremony or speculative abstraction.

Draft gates.yaml schema_version: 2 with only command/builtin gates using real project tooling. Qualitative review stays instructions, not agentic gates or regex coverage. Do not install tooling or change application code before approval. Route to approval.
