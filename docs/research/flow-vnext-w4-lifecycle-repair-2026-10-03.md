# W4 lifecycle repair — 2026-10-03

PR: #61

## Scope

This repair addresses only the two W4 lifecycle blockers from the review at
`8bcbb0e0e4a0b5a30a0ad9b7b29ea1f9b3e5c107`.

### Active work-item focus

- Task decomposition establishes or verifies `state.active.work_item` before
  mutating `tasks.yaml`.
- `task create` and `task set` reject a different work item while a focus is
  active.
- Focus establishment is rolled back if the decomposition write fails.
- Existing W3 recovery ownership is checked before a new focus is established.

### Workspace consistency

- The second writer still establishes concurrency with
  `--concurrent --workspace <shared|isolated>`.
- Once two or more writers are active, additional writers must use the persisted
  workspace strategy.
- Attempts to change workspace strategy while concurrency remains active are
  rejected without rewriting `state.active.concurrency`.
- Existing commit reconciliation clears concurrency below two active writers,
  allowing a later serialized execution to establish a different strategy.

## Regression coverage

- decomposition establishes and respects active focus;
- cross-work-item task create/set rejection;
- third writer with the same workspace succeeds;
- third writer with a different workspace fails;
- prior W1–W4 validation remains in the full CI suite.

No W5 or W6 behavior is included.
