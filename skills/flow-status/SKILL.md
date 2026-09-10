---
name: flow-status
description: Orient a developer or fresh agent from small readable Flow state without rediscovering the repository.
---

# Flow Status

## Objective

Explain where the project is, what is running, what is blocked, and what can run next with minimal context.

## Required behavior

1. Read `.flow/SUMMARY.md`, `.flow/STATE.yaml`, and `.flow/BACKLOG.yaml`.
2. Read active work-item TASKS/SPEC only when needed for active progress details.
3. Report concisely:
   - project stage and MVP progress;
   - active/in-progress work items and execution IDs;
   - ready work items;
   - pending consequential decisions;
   - blockers/reconciliation work;
   - current effective parallelism if work is active;
   - recommended next action.
4. Never scan the whole repository just to report status.
5. Never silently reclaim another execution's in-progress work.
6. Repair purely mechanical state inconsistencies only when the correct state is provable from canonical artifacts; otherwise surface the exact inconsistency.
