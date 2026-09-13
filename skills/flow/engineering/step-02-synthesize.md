# Engineering — recommend a contract

Read the approved PRD, config, full existing engineering evidence, repository tooling/contracts, profiles/readability-first.md and technology-defaults.md. Use existing_code_policy improve to critique accidental structure while preserving behavior; preserve gives consistent patterns stronger weight. Neither authorizes refactoring.

Recommend a complete but proportional contract. Frontmatter: schema_version: 1, status: draft, baseline.profile: flow/readability-first@1, baseline.existing_code_policy: improve|preserve|not_applicable. Include exact headings:

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

Materialize concrete paths, responsibilities, dependency direction, naming examples, stack conventions, tests and justified exceptions. Explicitly state not applicable/deferred areas and why. Review SRP, low coupling/high cohesion, colocated vertical slices, readability and complexity ROI. Do not mandate ceremony or speculative abstraction.

Draft gates.yaml schema_version: 1 with only command/builtin gates using real project tooling. Qualitative review stays instructions, not agentic gates or regex coverage. Do not install tooling or change application code before approval. Route to approval.
