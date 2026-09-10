---
name: flow-review
description: Validate implemented work against its spec and configured gates, create targeted fixes or maintenance work, and close the work item automatically when it passes.
---

# Flow Review

## Objective

Provide the final safety net after build while avoiding redundant re-analysis already covered by deterministic or approved agentic gates.

## Required behavior

1. Read the active SPEC/TASKS, relevant diff/commits, applicable gate definitions, and only the global decisions/engineering rules needed to validate them.
2. Verify every requirement and acceptance criterion.
3. Run all applicable blocking command gates and targeted checks.
4. Run applicable agentic gates only for policy that tools cannot determine reliably.
5. Check cross-task integration, obvious regressions, unexpected scope changes, and contract mismatches.
6. Produce manual validation steps only where automated/agentic validation cannot establish confidence.

## Failure

If review fails:
- create narrow fix tasks with real dependencies;
- leave the work item `in_progress`;
- return it to build automatically;
- create maintenance work instead of reopening completed unrelated items directly.

If review exposes a consequential decision, stop the affected path and use the required decision presentation protocol. Never silently resolve it during review.

## Success

When review passes:
- mark the work item `done`;
- update the SPEC `Overview`, `Validation Result`, and concise `Delivery Notes`;
- update BACKLOG and STATE;
- synchronize SUMMARY only when project-level understanding materially changed (for example work-item completion, MVP progress, architecture/production model, or key decision change);
- recompute the ready work graph.

Do NOT create `COMPLETION-LOG.md` or a separate per-work-item summary.

## Token-efficiency rules

- Do not repeat analysis already proven by command gates.
- Review the smallest relevant diff/contract surface.
- Avoid general-purpose reviewer subagents when a targeted gate answers the question.
- Keep review output concise and write only durable information to canonical artifacts.
