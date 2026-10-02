# Delivery — decompose the ready work-item

Read the approved work-item SPEC and applicable engineering contract. Decompose the outcome into the smallest set of independently coherent implementation tasks needed to satisfy acceptance.

Tasks may include code, configuration, schema/data changes, migrations, documentation required by the delivered behavior, focused validation or operational changes. Do not create ceremonial tasks that only restate the workflow.

Use `flow task create` for deterministic task identity and dependencies. The task list records what must be done; Git commits record what was actually done.

After tasks are created, route again and begin implementation immediately. Do not create or wait for an implementation-plan artifact and do not ask for plan approval.


## W1 planning checkpoint

Before a decision-heavy task decomposition batch, inspect `_flow/state.yaml`. Resume a matching task-planning checkpoint from its recorded frontier, or begin one through `flow checkpoint begin --data <json>` with `phase: planning`, a stable planning `step`, a target such as `kind: task_plan`, `ref: W###`, and the approved spec revision as an input reference.

Update the checkpoint after meaningful decomposition decisions. Once the task list is coherent, persisted and structurally validated, clear the active planning checkpoint with `flow checkpoint clear --target-ref W###`. Do not copy the task list into checkpoint state and do not hand-edit `state.yaml`.
