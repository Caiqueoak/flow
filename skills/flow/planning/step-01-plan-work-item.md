# Backlog — map the known MVP outcomes

Read the approved product and engineering contracts, then read `../backlog/work-items.md`.

Create the complete set of known MVP work-item shells so `graph.md` represents the path to the MVP. Keep shells intentionally shallow: a concise observable outcome plus necessary dependencies, priority and blockers; do not prematurely deepen every spec.

After the first work-item shell is persisted, begin or resume a planning checkpoint for the backlog mapping through `flow checkpoint begin|update`. Record only compact mapping decisions, unresolved dimensions/assumptions and the next frontier; target `_flow/work-items` rather than copying work-item specs into state. Update it after meaningful mapping decisions so a fresh chat can continue the same frontier.

Decompose by independently meaningful implementation outcomes, never by workflow phases. Planning, preparation, evidence collection, readiness, validation and review are normally tasks or gates inside the outcome they support.

Before persisting, run the qualitative backlog check in `backlog/work-items.md`: merge phase-like items, split oversized independent outcomes, verify each dependency is necessary, and ensure every work-item has a concrete implementation objective.

Use `flow work-item create --title ... --outcome ...` plus the other CLI work-item commands for deterministic IDs, outcomes, dependencies, priorities and blockers. Regenerate projections with `npx --no-install flow sync` and validate. Once the known mapping is structurally complete, update the checkpoint so no unresolved dimensions, assumptions, or frontier remain, then clear it with `flow checkpoint clear --target _flow/work-items`. Route again and continue. Do not create application code in this step.
