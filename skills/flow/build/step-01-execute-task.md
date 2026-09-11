# Build — execute one task

## Preconditions
- Load the active spec, task, relevant engineering rules, and required gates.
- Claim/persist the task as `in_progress` before edits.
- One shared worktree may have only one mutating Flow task. Parallel mutating tasks require isolated Git worktrees; otherwise serialize.
- Worker agents do not edit shared Flow control files.

## Implementation
Implement the smallest readable solution satisfying the task and approved engineering contract. Prefer present needs over speculative architecture. Run targeted verification, deterministic applicable gates, then agentic gates.

Before completion run `flow validate --pre-commit <qualified-task>` when the project is fully bootstrapped. Mark task completed only after checks pass. Create one primary commit:

```text
<conventional subject>

Flow-Work-Item: W015
Flow-Task: W015-T003
```

After integration, the orchestrator synchronizes task/backlog/spec/state/graph metadata and validates the reachable trailer with `flow trace` / `flow validate`.

## Invalid exits
Implementation done, tests passed, or “review is next” are not reasons to yield control. Route again.
