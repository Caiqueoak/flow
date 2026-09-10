---
name: flow-build
description: Implement ready tasks with maximum-safe parallelism, approved decisions and gates, token-efficient context packets, automatic claims, tests, commits, and state synchronization.
---

# Flow Build

## Objective

Implement an active work item efficiently while preserving approved product/engineering constraints and exploiting safe parallelism without turning parallelism into coordination or token waste.

## Context loading

Start with STATE, the current work item's SPEC/TASKS, and only the relevant global decisions/engineering/gates. Workers or subagents receive the smallest context packet needed for their task.

## Claims

Before implementation/delegation, mark selected tasks `in_progress` and set their `execution_id`. Synchronize state BEFORE code edits. Never take over a task or work item already `in_progress` under another execution ID.

There is no claim timeout. If ownership appears abandoned or inconsistent, surface it for explicit reconciliation rather than silently reclaiming it.

## Maximum-safe parallelism

The configured limits may be an integer or `auto`.

`auto` means the orchestrating agent must choose, for each scheduling cycle, the largest concurrency it can reliably coordinate without unacceptable risk. Consider:
- DAG independence;
- likely file/module/contract overlap;
- shared mutable state and migrations;
- unresolved or interacting decisions;
- task size and uncertainty;
- available runtime/subagent capabilities;
- context-window and tool limits;
- expected coordination/merge overhead;
- token efficiency.

The safe answer may be 1. Do not spawn workers merely because tasks are technically independent. Parallelize when the time/clarity benefit exceeds the context and coordination cost.

When `auto` is used, record the chosen effective concurrency for the current cycle in `STATE.yaml` so another agent or reader can understand what is happening.

## Execution

1. Compute all ready tasks.
2. Exclude tasks owned by another execution.
3. Determine the maximum-safe set under configuration.
4. Claim the complete selected set before implementation.
5. Execute directly or delegate safe independent tasks.
6. Apply approved conventions automatically; do not ask about already-settled rules.
7. Run applicable cheap/deterministic gates during implementation where practical.
8. Implement the smallest changes satisfying each task.
9. Run narrow relevant checks first, then broader checks when needed.
10. Create atomic commits when the environment permits; never include unrelated worktree changes.
11. Mark completed tasks `done`, record commit SHAs when available, recompute readiness, and synchronize state.

If implementation exposes a consequential unapproved decision, STOP affected work, preserve completed independent work, record the pending decision using the required decision format, and return control to the orchestrator for developer input.

If implementation reveals additional required work, add a task or backlog work item with real dependencies instead of silently expanding scope.

## Scope guard

Do not opportunistically refactor unrelated code. Record separate technical/maintenance work when useful.

## Token-efficiency rules

Token efficiency is a first-class optimization alongside correctness and maintainability:
- never provide each worker the full project history;
- prefer SUMMARY + exact relevant sections/IDs;
- avoid rereading completed specs and large historical sources;
- avoid multiple agents doing the same repository exploration;
- prefer deterministic tools/tests over reasoning-heavy review where possible;
- do not generate long execution narratives;
- use Git for implementation history;
- choose sequential execution when delegation overhead would cost more than it saves.
