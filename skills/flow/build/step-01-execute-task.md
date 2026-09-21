# Build — execute the current task

Read the applicable engineering contract, approved work-item SPEC, current tasks, affected code and tests. Load broader product context only when the SPEC references a global rule or execution exposes genuine product ambiguity.

Verify the routed task and repository state. Start the task through Flow, then implement the bounded outcome using semantic naming, SRP, low coupling, high cohesion, locality and justified complexity. Ordinary implementation choices are autonomous when they stay inside approved product/engineering boundaries.

If execution exposes a material product, public-contract, architecture, security, irreversible-operation or scope decision that is not covered, follow `../core/decisions.md`. Otherwise adapt locally and continue.

Preserve unrelated user work. Stage only the task's implementation, focused tests and necessary contract/document changes. Run the smallest safe verification plus `npx --no-install flow validate --pre-commit W###-T###`.

Commit and complete atomically through `npx --no-install flow task commit W###-T### --message "type(domain): description [W###-T###]" --files ...`. Never invent or persist a commit SHA in tasks. Use `flow trace` when recovering or auditing.

After commit, validate the minimum necessary state, route again and continue. A completed task is never a reason to stop and report progress.
