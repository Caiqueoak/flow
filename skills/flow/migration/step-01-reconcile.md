# Migration — reconcile semantic constraints

Structural migration does not approve old product or engineering truth. Read available legacy-state.md, legacy-decisions.md, legacy-engineering.md, legacy-summary.md, legacy-backlog.yaml and affected specs alongside repository evidence.

When `_flow/docs/migration-backup/` exists, it is a complete read-only snapshot of an older Flow directory whose format could not be converted safely. Inspect all relevant evidence there and rebuild current canonical artifacts; do not copy obsolete schemas into their current locations.

Transfer current product truth to prd.md, engineering constraints to a draft engineering.md, active external approval restrictions to structured unresolved backlog blockers, and work-item rationale to specs. Keep legacy evidence read-only for provenance. Do not erase completed task history or invent missing commits.

Present reconciliation and consequential questions to the human. After semantic constraints are transferred, the current project validates, and the human confirms the result, delete `_flow/docs/migration-backup/`, set migration.status: completed, clear the resolved stop and route through PRD/engineering approval as needed. Retain the timestamped recovery copy under `_flow-backups/`. Missing pending folders are allowed only during reconciliation; complete backlog planning creates them before implementation. Do not mutate production, reset data or delete legacy systems based on prose evidence alone.
