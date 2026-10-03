# Migration — reconcile semantic constraints

Structural migration/adoption is conservative. It may normalize supported schemas, bind an already-recorded legacy approval to the exact current bytes, regenerate projections and reconstruct an active work-item only when canonical evidence makes that unambiguous. It must not invent historical rationale, checkpoints, approvals, findings, tasks, worker evidence or Git history.

Read preserved legacy evidence alongside the current repository:

- `legacy-state.md`, `legacy-decisions.md`, `legacy-engineering.md`, `legacy-summary.md`, `legacy-backlog.yaml` and affected specs when present;
- `_flow/docs/migration-backup/` when rescue preserved an older Flow directory;
- current work-item/task/review artifacts and Git trace evidence.

Treat migration backup and legacy files as read-only provenance, never as a second SSOT.

Adoption rules:

1. Preserve completed work-item, task and review history. Do not rewrite completed artifacts merely to fit vNext schemas.
2. Active/future legacy task or review schemas may be upgraded when touched; legacy approved review remains valid without fabricated v2 findings or parecer.
3. Legacy approved PRD/engineering with a valid recorded approval time may be rebound to the exact current normalized revision by the supported migration path. This preserves an existing human decision; it does not create a new one.
4. A legacy PRD with no experience metadata routes as compatibility `not_required` for the existing approved scope. The next substantive PRD revision must explicitly record `experience: required|not_required`.
5. Never trust dormant legacy execution phase/step fields as a resumable cursor. Reconstruct active work-item only from unambiguous canonical task/review state. Create no checkpoint unless durable draft evidence genuinely requires recovery.
6. Regenerate `_flow/generated/backlog.yaml` and `_flow/generated/graph.md` from canonical work items. Generated files are never migrated as authority.
7. Preserve exact approvals, W4 active-focus/concurrency safety, W5 review history and W6 delegation requirements after adoption exactly as for a new project.

When semantic reconciliation is still required, transfer only current product truth into the PRD, current architecture/topology into engineering, active external restrictions into structured blockers, and work-item-specific rationale into the owning SPEC. Keep uncertain history uncertain and surface consequential ambiguity to the human.

After reconciliation, run `flow sync` and `flow validate --json`. When canonical state is structurally safe, finish the migration through `flow migrate --complete-reconciliation`; this is the only supported `pending_reconciliation -> completed` transition and it writes `state.yaml` atomically. If validation/recovery still reports structural inconsistency, completion must fail and migration remains pending. Then run `flow route --json` and continue through any PRD/experience/engineering/SPEC work or approval that is actually required. Do not hand-edit `state.yaml`, approval revisions, generated projections, or finalized review history.

When `_flow/docs/migration-backup/` exists, retain it until reconciliation is complete and confirmed. The timestamped copy under `_flow-backups/` remains recovery provenance. Do not mutate production, reset data or delete legacy systems based only on prose evidence.
