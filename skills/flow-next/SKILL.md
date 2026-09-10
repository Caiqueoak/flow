---
name: flow-next
description: Autonomous Flow orchestrator: advance all currently safe work through planning, build, gates, review, fixes, reconciliation, and completion until a consequential decision or real blocker requires developer input.
---

# Flow Next

## Objective

Make Flow autonomous by default. The user should not manually drive feature -> build -> review transitions or remind the agent to synchronize state.

## Stop conditions

Continue automatically until one of the configured conditions occurs:
- consequential decision requires explicit approval;
- external approval/action cannot be safely performed autonomously;
- unrecoverable blocker;
- no ready work remains;
- configuration explicitly says not to continue across work items.

`continue_across_work_items: true` means that after one work item passes review and closes, immediately recompute the work DAG and continue with the next safe ready work instead of waiting for another command.

## Main loop

1. Read `config.yaml`, `STATE.yaml`, `BACKLOG.yaml`, `SUMMARY.md`.
2. Respect all work/tasks already marked `in_progress` under other execution IDs.
3. If global discovery is incomplete, invoke/follow `flow-new` until it completes or requires a decision.
4. Reconcile any `needs_reconciliation` work before execution when necessary.
5. Compute ready work items from dependencies, decision impacts, status, and ownership.
6. Determine the maximum-safe work-item set under parallelism configuration.
7. Mark the selected work items `in_progress` with the current run/execution ID BEFORE planning/delegation.
8. Plan unplanned items via `flow-plan` semantics. If a consequential decision emerges, preserve independent progress and stop only the affected path; present the maximal currently-known independent decision batch.
9. Build ready planned work via `flow-build` semantics, including safe task parallelism and delegation when beneficial.
10. Run configured gates and `flow-review` semantics.
11. If review creates fix tasks, return them automatically to build and review again.
12. Close passing work items, create maintenance work for completed items impacted by new decisions, synchronize canonical artifacts, and recompute the DAG.
13. If `continue_across_work_items` is true, continue the loop.

## Decision discipline

Never infer a consequential choice merely to preserve autonomy. Autonomy means doing everything that follows from approved rules; it does not mean owning approved product or engineering decisions.

Every requested decision uses the six-part format: Decision, Context, Options, Recommended option, Why recommended, Impact.

Batch the maximum set of currently-known decisions that do not depend on each other. Do not speculate about future decisions to make the batch larger.

## Parallelism and token efficiency

Parallelism-first means exploiting safe independent work, not maximizing agent count. Under `auto`, choose the largest concurrency that can be reliably coordinated given dependencies, overlap, uncertainty, context/tool capacity, merge risk, and token cost. Record the effective choice in state.

Prefer one primary orchestrator. Spawn subagents/workers only when their independence and expected benefit justify extra context. Give each worker a narrow context packet and explicit ownership.

## State synchronization

Every transition that changes decisions, work status, tasks, gates, PRD, engineering definition, or project overview must synchronize the affected canonical artifacts before continuing. The user should never need to request housekeeping updates.
