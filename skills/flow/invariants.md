# Flow invariants

1. Persist lifecycle states only pending, in_progress and completed. Eligible/Blocked are derived.
2. One mutating work item and task at a time across the project. Read-only research/review may be parallel; Flow does not orchestrate concurrent mutating worktrees.
3. PRD approval precedes engineering approval; both precede complete backlog creation.
4. Keep the full outlined backlog, but create a work-item spec on demand; create tasks.yaml and implementation-plan.md only once its spec is ready.
5. Every ready work item needs a human-approved implementation-plan.md before application code changes.
6. Plans bind to exact SHA256 engineering and spec text; stale approval cannot authorize implementation.
7. Read the full engineering.md before planning, implementation and review. Missing/unapproved engineering blocks code.
8. SRP, semantic naming, cohesion, low coupling, locality and justified complexity guide qualitative review; do not fake mechanical proof with Markdown regex.
9. Dependencies belong in depends_on. External approvals belong in structured unresolved blockers.
10. Regenerate graph through npx --no-install flow graph; never hand-edit derived output.
11. Each mutating task is completed by `flow task commit`, which creates exactly one implementation commit with the permanent ID in the subject and both Flow trailers. Native tasks never persist traceability fields; `provenance: legacy_migration` is reserved for completed migrated tasks.
12. Completion requires acceptance, verification, review and traceability. Completed changes become fix tasks or maintenance work.
13. Pending migration reconciliation blocks all normal planning/build until legacy constraints reach canonical owners.
14. Invoke only local npx --no-install flow commands. Progress alone is not a terminal stop.
