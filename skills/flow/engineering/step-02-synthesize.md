# Engineering — recommend a contract

Read the approved PRD, config, repository evidence, technology-defaults.md and the exact engineering profile selected by config before drafting:

- `flow/readability-first@2` -> `profiles/readability-first-v2.md`
- `flow/readability-first@1` -> `profiles/readability-first.md`

Use the selected profile as defaults and recommendation criteria, not as text to copy mechanically. For brownfield, inspect the actual repository first and distinguish observed state from desired state. If config records `undecided`, present `preserve`, `incremental`, and `refactor`, recommend one with project-specific justification, and ask one focused consequential question. Do not finalize the engineering contract until the user chooses. None is inferred from profile mismatch and refactoring requires the user's explicit choice.

Recommend a complete but proportional technical contract. Keep global product behavior in the PRD and bounded delivery behavior in work-item specs; engineering records only the technical/code/infra constraints that realize them.

Frontmatter:

- `schema_version: 1`
- `status: draft`
- `baseline.profile`: exact versioned profile id selected in config
- `baseline.existing_code_policy: preserve|incremental|refactor|not_applicable` — never persist `undecided` in the engineering contract

Include exact headings:

# Engineering

## Observed system

For greenfield write `not applicable`. For brownfield summarize the architecture, topology, conventions, tests/tooling and relevant inconsistencies that actually exist.

## Adoption strategy

Record `not_applicable|preserve|incremental|refactor` with the reason for the chosen strategy.

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
