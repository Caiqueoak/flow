# Recovery

Repository and Git state are the recovery source of truth. Never depend on the previous chat.

Before resuming interrupted work, inspect Doctor/recovery results, the canonical Flow artifacts, Git status and traceability. Resume a persisted decision checkpoint before inferring progress from a draft artifact. Respect `state.active.work_item`, W4 concurrency intent and W5 review history. Preserve unrelated user changes. Never reset, absorb or rewrite unknown work just to make Flow clean.

Handle common recovery cases as follows:

- interrupted active task: derive what is already committed/staged/modified, then continue the same task safely;

- dirty worktree: keep unrelated changes outside the Flow task commit; ask only when ownership is genuinely ambiguous;

- commit uncertainty: use `flow trace`, Git history and task state before retrying;

- pre-existing failing checks: distinguish them from regressions caused by the current task; do not silently expand scope;

- manual repository edits: revalidate canonical artifacts and regenerate only derived projections;

- rebase/squash: rediscover task commits from permanent W###-T### identity and trailers instead of stored SHAs;

- obsolete pending task: revise the active work-item task decomposition rather than implementing ceremony;

- interrupted review: resume the mutable `review.yaml` v2 active pass and its recorded evidence/findings; never recreate finalized passes from memory;

- migrated project: use `migration/step-01-reconcile.md`; preserve exact compatible approvals/completed history and reconstruct only facts proven by canonical repository/Git evidence;

- newly discovered scope: update only current/future contracts; never rewrite completed history.
