# Recovery

Repository and Git state are the recovery source of truth. Never depend on the previous chat.

Before resuming interrupted work, inspect Flow state, Git status and traceability. Preserve unrelated user changes. Never reset, absorb or rewrite unknown work just to make Flow clean.

Handle common recovery cases as follows:

- interrupted active task: derive what is already committed/staged/modified, then continue the same task safely;

- dirty worktree: keep unrelated changes outside the Flow task commit; ask only when ownership is genuinely ambiguous;

- commit uncertainty: use `flow trace`, Git history and task state before retrying;

- pre-existing failing checks: distinguish them from regressions caused by the current task; do not silently expand scope;

- manual repository edits: revalidate canonical artifacts and regenerate only derived projections;

- rebase/squash: rediscover task commits from permanent W###-T### identity and trailers instead of stored SHAs;

- obsolete pending task: revise the active work-item task decomposition rather than implementing ceremony;

- newly discovered scope: update only current/future contracts; never rewrite completed history.
