# Delivery — decompose the ready work-item

Read the approved work-item SPEC and applicable engineering contract. Start or resume a planning checkpoint targeting that work item's `tasks.yaml` before decision-heavy decomposition. Persist compact task-boundary decisions, assumptions and the next frontier with `flow checkpoint begin|update`; do not copy the SPEC or task list into state.

Decompose the outcome into the smallest set of independently coherent implementation tasks needed to satisfy acceptance.

Tasks may include code, configuration, schema/data changes, migrations, documentation required by the delivered behavior, focused validation or operational changes. Do not create ceremonial tasks that only restate the workflow.

Use `flow task create` for deterministic task identity and dependencies. The task list records what must be done; Git commits record what was actually done.

After task creation, validate the canonical work item. Once decomposition is coherent and complete, update the checkpoint so no unresolved dimensions, assumptions, or frontier remain, then clear it with `flow checkpoint clear --target <work-item>/tasks.yaml`. Route again and begin implementation immediately. Do not create or wait for an implementation-plan artifact and do not ask for plan approval.
