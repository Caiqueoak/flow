# Planning — plan one work item

Create/update the active work item's `spec.md` and `tasks.yaml`.

`spec.md` must include Status, Goal, Scope, Non-goals, Requirements, Acceptance criteria, Decisions, Implementation, Final outcome, Validation, and Follow-up. Goal/scope/requirements/acceptance form the approved contract; do not silently rewrite them during build.

Tasks must be bounded and independently verifiable. Use `T###` local IDs. Mark non-code tasks with `implementation: none`; code-changing tasks default to `implementation: commit` and must later map to one `Flow-Task: W###-T###` commit.

Plan applicable gates before implementation. Then route again without pausing merely to announce the plan.
