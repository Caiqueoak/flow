# Build — execute one approved task

Read the applicable global PRD rules, the FULL engineering.md, spec, tasks and approved current implementation plan. Verify current route and approval hashes before application edits. Persist both selected work item and task in_progress; no other mutating task may be active.

Implement the bounded approved change for readability: semantic naming, mandatory SRP, low coupling, high cohesion, locality and justified complexity. If the approach must change materially, revise the plan and ask approval before continuing.

Inspect the worktree, stage only this task's bounded implementation, focused tests, necessary contracts/migrations and required documentation, then compare the staged diff with the approved spec and plan. Reject unrelated changes. Run the smallest safe tests and `npx --no-install flow validate --pre-commit W###-T###`.

Commit and complete the task atomically through `npx --no-install flow task commit W###-T### --message "type(domain): description [W###-T###]" --files path/to/file,...`. The command requires the declared files to match the staged set exactly, creates the one canonical implementation commit with matching `Flow-Work-Item` and `Flow-Task` trailers, and persists task completion in that commit. Never create the implementation commit manually and never edit task completion metadata directly. On failure, recover with `flow trace`/`flow doctor` rather than recreating implementation. Validate traceability, validate again and route onward.
