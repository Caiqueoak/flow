# Engineering bootstrap — synthesize

## Objective
Draft the complete recommended engineering contract.

## Required architecture scope
Resolve each dimension as `defined`, `not_applicable`, or `deferred`:

1. system shape
2. module architecture and dependency direction
3. code organization
4. data/state ownership
5. external boundaries
6. language/framework conventions and naming
7. engineering principles
8. quality/testing strategy
9. operational/environment conventions
10. enforcement

## Decision policy
Recommend rather than quiz. Read `technology-defaults.md` and infer ecosystem conventions where defensible. Deviate from ecosystem defaults only for a concrete project reason.

Apply the complexity test to every architectural mechanism:
- required now? if no,
- credible near-term growth needs it? if no, reject;
- expensive/risky to add later? if no, defer;
- does ongoing complexity exceed avoided migration cost? if yes, defer.

## Contract
Draft `.flow/docs/engineering.md` with structured frontmatter and stable rules such as `ENG-ARCH-001`, `ENG-NAME-001`, `ENG-CODE-001`.
Do not mark it approved yet.

Before leaving this step, create/update `.flow/state.yaml` with `execution.phase: engineering_bootstrap`, `execution.step: enforcement`, and `stop_reason: null`.

## NEXT
Continue to enforcement design; do not return to the user yet.
