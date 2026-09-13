# Build — execute one approved task

Read the FULL engineering.md, spec, tasks and approved current implementation plan. Verify current route and approval hashes before application edits. Persist both selected work item and task in_progress; no other mutating task may be active.

Implement the bounded approved change for readability: semantic naming, mandatory SRP, low coupling, high cohesion, locality and justified complexity. If the approach must change materially, revise the plan and ask approval before continuing.

Run targeted tests and npx --no-install flow validate --pre-commit W###-T###. Mark completed only after checks pass. Code tasks get exactly one primary implementation commit with separate trailers Flow-Work-Item: W### and Flow-Task: W###-T###. Non-code tasks use none. Do not assign legacy to new work.

Synchronize metadata and graph, validate traceability with npx --no-install flow trace W###-T###, validate again and route to the next task/review. Do not yield merely for status.
