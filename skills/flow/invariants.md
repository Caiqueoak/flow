# Flow invariants

1. Run `flow doctor --quick --json` at the start of every /flow invocation before trusting repository state.
2. Persist lifecycle states only pending, in_progress and completed. Eligible/Blocked are derived.
3. One active work item is the delivery boundary. Every `in_progress` task must match `state.active.work_item`. Multiple `in_progress` tasks are allowed only inside that work item when every concurrent task has complete non-conflicting mutation claims, no dependency path or shared resource conflict exists, recovery/contracts remain authorized, and the orchestrator explicitly starts each additional writer with a persisted `shared` or `isolated` workspace strategy. Parallelism is an orchestrator judgment; no fixed worker count or mandatory worktree is imposed.
4. The CLI owns deterministic structure, state transitions, dependency legality, traceability, gates and migration safety. The agent owns product, architecture, decomposition and trade-off judgment.
5. Discovery is recommendation-driven: present reasonable options, recommend one with justification, and ask only consequential questions.
6. Keep the complete known MVP work-item map so the dependency graph remains useful, but deepen only the next eligible item.
7. A work-item is a cohesive implementation outcome. Phase-only planning, preparation, evidence, readiness, validation and review belong to tasks/gates unless they are independently valuable deliverables.
8. Human approval authorizes exact canonical revisions: PRD, required experience, engineering, and consequential ready SPECs. Material edits invalidate prior authorization even if an `approved` label remains. Do not manufacture approval checkpoints for routine execution.
9. Read the exact-approved PRD, required experience contract, and engineering contract before implementation. In brownfield, distinguish observed state, desired state and the chosen adoption strategy.
10. The approved `_flow/docs/engineering.md` is the mandatory project architecture/topology contract. New or changed code must conform to its system shape, ownership, dependency direction, vertical-slice organization, naming/readability conventions and explicit exceptions. If a task requires a material topology or architecture change, revise and approve engineering.md before implementing that change; never create a parallel architecture implicitly.
11. Profiles provide defaults and recommendations; they never authorize retroactive refactoring.
12. Dependencies belong in depends_on. External approvals/actions and consequential unresolved decisions belong in structured blockers.
13. Each mutating task is completed by `flow task commit`, with permanent W###-T### identity in the subject and matching Flow trailers. SHA is derived with `flow trace`, not stored as canonical task identity.
14. Completion requires observable acceptance, appropriate verification, qualitative review and traceability.
15. Active-work defects become tasks in the same work-item. Completed-work corrections become new maintenance work-items; completed history is immutable.
16. Repository and Git state are the recovery source of truth. Preserve unrelated user changes and never replay uncertain mutations blindly.
17. Progress, phase transitions, planning, successful checks and completed tasks are not terminal stops. Route and continue until completion or a legitimate human stop.
