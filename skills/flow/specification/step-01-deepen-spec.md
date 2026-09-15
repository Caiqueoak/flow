# Specification — deepen one eligible work-item

Read the PRD, full engineering contract and selected backlog outline. Do not deepen other work-items.

Create `spec.md` with `# Work Item Specification` and sections Problem, Scope, Non-goals, Requirements, observable Acceptance criteria, Contracts, Data and APIs, Edge cases, Risks, Decisions, and Gates. Resolve ambiguity that would make planning unsafe. Keep `spec_maturity` exclusively in backlog.

Validate, then run `flow work-item promote W###`. Only then create tasks and a plan. Contract, dependency or spec changes invalidate unexecuted plans; never rewrite completed history.
