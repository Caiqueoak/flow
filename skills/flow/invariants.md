# Flow invariants

These invariants apply to every routed step.

1. **No status-only stop.** While `flow route` returns `continue`, a progress update, task completion, work-item completion, or description of the next step is not a terminal state.
2. **Repository-resumable.** At every completed step boundary, a fresh agent session must be able to run `/flow` and derive the same next action from repository state alone.
3. **Single lifecycle state.** Persist only `pending`, `in_progress`, or `completed`; Ready/Blocked is always derived.
4. **Dependency truth.** `depends_on` is the authoritative work-item DAG and every work-item prerequisite must be an edge.
5. **Derived artifacts.** Never edit `docs/graph.md` manually.
6. **Completion postconditions.** Nothing becomes completed until its required tasks, gates, review, traceability, spec outcome, graph/state synchronization, and validation pass.
7. **Canonical authorization.** `/flow` implicitly authorizes canonical Flow artifacts; extra artifact classes require a real need.
8. **Immutable completed history.** Later changes create fix/maintenance work rather than silently rewriting completed records.
9. **Control-plane ownership.** The primary orchestrator owns shared Flow state files.
10. **Safe mutating parallelism.** Mutating tasks execute concurrently only in isolated Git worktrees; otherwise serialize them.
11. **Deterministic first.** Use code/tooling for schemas, transitions, bookkeeping, and enforceable rules; use model judgment only where judgment is necessary.
12. **Proportional architecture.** Prefer the least complex design that satisfies current requirements and credible near-term growth.
