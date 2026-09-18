# Specification — deepen one eligible work-item

Read the PRD, full engineering contract and selected backlog outline. Do not deepen other work-items.

Create `spec.md` with `# Work Item Specification` and sections Problem, Scope, Non-goals, Requirements, observable Acceptance criteria, Contracts, Data and APIs, Edge cases, Risks, Decisions, and Gates. Resolve ambiguity that would make planning unsafe. Keep `spec_maturity` exclusively in backlog.

Validate, then run `flow work-item promote W###`. If the user's current instruction explicitly authorizes proceeding with this work-item and the finalized SPEC introduces no unresolved consequential choice, record approval for this exact SPEC revision in the same step with `flow approval record <spec.md>`. Participation in discovery/specification alone is not consent. Otherwise route to the approval step. Never create tasks before the exact ready SPEC is approved.

Contract, dependency or spec changes invalidate unexecuted briefs; never rewrite completed history.
