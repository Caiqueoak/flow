# Reconcile — restore canonical truth

Start from Doctor/recovery findings and reconstruct only what repository, Flow and Git evidence can prove. Never depend on chat history, artifact existence alone, or an old execution cursor.

Use the vNext owners consistently:

- product truth: exact-approved `_flow/docs/prd.md`;
- required experience truth: exact-approved `_flow/docs/experience.md`;
- engineering/topology truth: exact-approved `_flow/docs/engineering.md`;
- work-item scope: canonical `spec.md`;
- task decomposition/state: canonical `tasks.yaml`;
- durable review/repair history: canonical `review.yaml`;
- active work-item focus, W4 concurrency intent and resumable decision checkpoints: `_flow/state.yaml`;
- implementation identity/evidence: Git commits/trailers resolved through `flow trace`;
- `_flow/generated/backlog.yaml` and `_flow/generated/graph.md`: disposable projections only.

Reconcile conservatively:

1. preserve completed work-item/task/review history;
2. never fabricate an active checkpoint, rationale, approval, task, finding, repair, worker run or Git evidence;
3. prefer deterministic safe repair when Doctor reports it; consequential conflicts stop before mutation;
4. reconstruct `state.active.work_item` only from unambiguous current canonical task/review state;
5. preserve W4 safety: multiple active tasks are valid only inside one focused work item with compatible complete mutation claims and the persisted workspace strategy;
6. preserve W5 review history: repair current/future state around append-only finalized passes instead of rewriting findings or dispositions;
7. regenerate projections with `flow sync` after canonical work-item changes, then validate and route again.

When recovery returns to implementation, read `../core/orchestration.md`: non-simple implementation still requires an available worker mechanism. Reconciliation is not permission for the orchestrator to silently perform non-simple implementation directly.

For product, experience, engineering or SPEC changes, revise the affected canonical contract through its normal decision phase and obtain exact-revision approval before downstream work continues. Existing approval timestamps/revisions may be preserved only by supported migration compatibility rules; never copy or invent them manually.

Use Flow commands for state transitions and canonical lifecycle mutations. Do not hand-edit `state.yaml`, generated projections, finalized review passes, or derived completion state.
