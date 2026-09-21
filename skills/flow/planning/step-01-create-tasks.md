# Delivery — decompose the ready work-item

Read the approved work-item SPEC and applicable engineering contract. Decompose the outcome into the smallest set of independently coherent implementation tasks needed to satisfy acceptance.

Tasks may include code, configuration, schema/data changes, migrations, documentation required by the delivered behavior, focused validation or operational changes. Do not create ceremonial tasks that only restate the workflow.

Use `flow task create` for deterministic task identity and dependencies. The task list records what must be done; Git commits record what was actually done.

After tasks are created, route again and begin implementation immediately. Do not create or wait for an implementation-plan artifact and do not ask for plan approval.
