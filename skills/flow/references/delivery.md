# Delivery contract

## Discover and specify
Read code, tests, project docs and relevant Git history. Define one outcome per work-item, identify dependencies and assign the next stable W### ID. For substantial work use requirements → design → tasks. For trivial changes keep each document concise (do not omit traceability when an implementation task is performed). Update global docs only for global truth changes.

## Route and execute
Prefer completing one eligible work-item; an item is eligible only when its dependencies are complete and decisions/blockers are resolved. Tasks can run concurrently only if their dependencies, files, shared state and integration requirements allow safe separation. Workers own disjoint scopes; orchestrator integrates and validates. Never require delegation when the agent can execute directly.

For each implementation task:
1. Review acceptance criteria, affected code and tests; establish baseline.
2. Write or update a failing behavioral test; confirm it fails for the expected reason (RED).
3. Implement minimum solution until targeted tests pass (GREEN).
4. Refactor for simplicity, readability, SRP and maintainability with tests green.
5. Run applicable checks (targeted then wider if risk demands), review diff and stage only task-related changes.
6. Create one commit with a single subject, e.g. `feat(auth): implement password validation [W001-T001]`. No additional Flow-Work-Item or Flow-Task trailers.
7. Verify the commit exists and record completion in tasks.md; update progress/graph as appropriate. Prefer including documentation completion in the same task commit; if the task itself is solely documentation, its sole commit is the task commit.

Do not mechanically create separate commits for RED, GREEN and REFACTOR. If testing cannot be performed, do not claim verified completion; document limitation and obtain user's direction if consequential. A docs-only, configuration-only or investigation task can instead use a stated suitable validation procedure.

## Review and resume
Check acceptance criteria, test results, integration, regression risk, Git identity and unresolved blockers. Work-item complete only when its delivered outcome is verified, not merely its planning docs written. Reconcile `tasks.md` against Git before claiming completion. When interrupted, `progress.md` tells the next agent where to resume; use Git for evidence, not copied SHAs.

For existing legacy Flow projects, preserve completed IDs/records; map them into this layout incrementally. Do not automatically run migrations or remove the old CLI. Report any incompatible existing schema and propose a safe transition.
