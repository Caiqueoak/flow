# Build — execute the current task

Read the applicable engineering contract, approved work-item SPEC, current tasks, affected code and tests. Load broader product context only when the SPEC references a global rule or execution exposes genuine product ambiguity.

Before changing code, verify that intended files, ownership, dependency direction and slice placement conform to the approved engineering.md. Treat that contract as normative. Do not introduce a new topology, ownership model, dependency direction, cross-slice coupling pattern or architectural exception outside the approved contract. If the outcome requires a material architectural change, revise engineering.md through the engineering decision flow and obtain approval before implementing that architectural change.

Verify the routed task and repository state. Start the task through Flow, then implement the bounded outcome using semantic naming, SRP, SSOT, low coupling, high cohesion, locality, vertical-slice ownership, KISS and justified complexity. Keep intent before mechanics and prefer code that is easy to understand before it is clever or abstract. Ordinary implementation choices are autonomous when they stay inside approved product/engineering boundaries.

If execution exposes a material product, public-contract, architecture, security, irreversible-operation or scope decision that is not covered, follow `../core/decisions.md`. Otherwise adapt locally and continue.

Preserve unrelated user work. Stage only the task's implementation, focused tests and necessary contract/document changes. Run the smallest safe verification plus `npx --no-install flow validate --pre-commit W###-T###`.

Commit and complete atomically through `npx --no-install flow task commit W###-T### --message "type(domain): description [W###-T###]" --files ...`. Never invent or persist a commit SHA in tasks. Use `flow trace` when recovering or auditing.

After commit, validate the minimum necessary state, route again and continue. A completed task is never a reason to stop and report progress.
