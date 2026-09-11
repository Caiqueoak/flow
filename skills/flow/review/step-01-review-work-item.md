# Review — validate work item

Review the implementation against the frozen work-item contract, engineering rules, required gates, integration behavior, and regressions.

Run `flow gates --json` and execute all returned `agent_required` profiles. Deterministic blocking gates are re-run by `flow validate`; agentic gates must be recorded in the spec Validation section as a `gate-id: passed` bullet only after review. For each real defect, create a new fix task rather than rewriting a completed task's history; execute fixes through normal build routing.

A work item may become `completed` only when all tasks are completed and traceable, acceptance criteria pass, blocking gates pass, review passes, `spec.md` Final outcome / Implementation / Validation are populated, backlog/graph/state are synchronized, and `flow validate` succeeds.

After completion route again; do not stop if other work is ready.
