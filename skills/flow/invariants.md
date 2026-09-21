# Flow invariants

1. Run `flow doctor --quick --json` at the start of every /flow invocation before trusting repository state.
2. Persist lifecycle states only pending, in_progress and completed. Eligible/Blocked are derived.
3. One mutating work item and task at a time across the project. Read-only investigation may be parallel; Flow does not orchestrate concurrent mutating worktrees.
4. The CLI owns deterministic structure, state transitions, dependency legality, traceability, gates and migration safety. The agent owns product, architecture, decomposition and trade-off judgment.
5. Discovery is recommendation-driven: present reasonable options, recommend one with justification, and ask only consequential questions.
6. Keep the complete known MVP work-item map so the dependency graph remains useful, but deepen only the next eligible item.
7. A work-item is a cohesive implementation outcome. Phase-only planning, preparation, evidence, readiness, validation and review belong to tasks/gates unless they are independently valuable deliverables.
8. The human authorizes the exact ready SPEC revision when it contains consequential choices not already authorized. Do not manufacture approval checkpoints for routine execution.
9. Read the approved engineering contract before implementation. In brownfield, distinguish observed state, desired state and the chosen adoption strategy.
10. Profiles provide defaults and recommendations; they never authorize retroactive refactoring.
11. Dependencies belong in depends_on. External approvals/actions and consequential unresolved decisions belong in structured blockers.
12. Each mutating task is completed by `flow task commit`, with permanent W###-T### identity in the subject and matching Flow trailers. SHA is derived with `flow trace`, not stored as canonical task identity.
13. Completion requires observable acceptance, appropriate verification, qualitative review and traceability.
14. Active-work defects become tasks in the same work-item. Completed-work corrections become new maintenance work-items; completed history is immutable.
15. Repository and Git state are the recovery source of truth. Preserve unrelated user changes and never replay uncertain mutations blindly.
16. Progress, phase transitions, planning, successful checks and completed tasks are not terminal stops. Route and continue until completion or a legitimate human stop.
