# Build — execute one approved task

Read the applicable global PRD rules, the FULL engineering.md, spec, tasks and approved current implementation plan. Verify current route and approval hashes before application edits. Persist both selected work item and task in_progress; no other mutating task may be active.

Implement the bounded approved change for readability: semantic naming, mandatory SRP, low coupling, high cohesion, locality and justified complexity. If the approach must change materially, revise the plan and ask approval before continuing.

Inspect the worktree, stage only this task's bounded implementation, focused tests, necessary contracts/migrations and required documentation, then compare the staged diff with the approved spec and plan. Reject unrelated changes. Run the smallest safe tests and `npx --no-install flow validate --pre-commit W###-T###`. A `traceability: commit` task gets exactly one coherent implementation commit, with `W###-T###` in its objective message plus `Flow-Work-Item: W###` and `Flow-Task: W###-T###` trailers. Follow the project's commit convention. A deliberate non-repository task uses `traceability: none`; `legacy` is migration-only.

After that commit exists, run `flow task complete W###-T###`; this records its full Git object ID and completion metadata as a separate administrative change/commit without Flow trailers. On persistence failure, recover with `flow trace`/`flow doctor` rather than recreating implementation. Validate traceability, validate again and route onward.
