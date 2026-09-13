# Flow invariants

1. Persist lifecycle states only pending, in_progress and completed. Ready/Blocked are derived.
2. One mutating work item and task at a time across the project. Read-only research/review may be parallel; Flow does not orchestrate concurrent mutating worktrees.
3. PRD approval precedes engineering approval; both precede complete backlog creation.
4. Create every known work-item folder, spec.md and tasks.yaml before any implementation. No just-in-time missing work-item artifacts in native projects.
5. Every work item needs a human-approved implementation-plan.md before application code changes.
6. Plans bind to exact SHA256 engineering and spec text; stale approval cannot authorize implementation.
7. Read the full engineering.md before planning, implementation and review. Missing/unapproved engineering blocks code.
8. SRP, semantic naming, cohesion, low coupling, locality and justified complexity guide qualitative review; do not fake mechanical proof with Markdown regex.
9. Dependencies belong in depends_on. External approvals belong in structured unresolved blockers.
10. Regenerate graph through npx --no-install flow graph; never hand-edit derived output.
11. New code tasks use implementation: commit and both Flow trailers. Non-code tasks use none. legacy is reserved for completed migrated tasks, never new work.
12. Completion requires acceptance, verification, review and traceability. Completed changes become fix tasks or maintenance work.
13. Pending migration reconciliation blocks all normal planning/build until legacy constraints reach canonical owners.
14. Invoke only local npx --no-install flow commands. Progress alone is not a terminal stop.
