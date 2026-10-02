# Backlog — map the known MVP outcomes

Read the approved product and engineering contracts, then read `../backlog/work-items.md`.

Create the complete set of known MVP work-item shells so `graph.md` represents the path to the MVP. Keep shells intentionally shallow: a concise observable outcome plus necessary dependencies, priority and blockers; do not prematurely deepen every spec.

Decompose by independently meaningful implementation outcomes, never by workflow phases. Planning, preparation, evidence collection, readiness, validation and review are normally tasks or gates inside the outcome they support.

Before persisting, run the qualitative backlog check in `backlog/work-items.md`: merge phase-like items, split oversized independent outcomes, verify each dependency is necessary, and ensure every work-item has a concrete implementation objective.

Use `flow work-item create --title ... --outcome ...` plus the other CLI work-item commands for deterministic IDs, outcomes, dependencies, priorities and blockers. Regenerate projections with `npx --no-install flow sync`, validate, route again and continue. Do not create application code in this step.

## W1 planning checkpoint

Once the first canonical work-item shell exists, persist a compact planning checkpoint through `flow checkpoint begin --data <json>` (or update the existing matching checkpoint). Use a planning target such as `kind: work_item_map`, `ref: _flow/work-items`, with no target revision until a later contract defines one. Record only mapping decisions, unresolved/deferred dimensions, assumptions, authorized direction and the next frontier.

After the known MVP outcome map is structurally complete, projections are regenerated and validation succeeds, clear that active planning checkpoint with `flow checkpoint clear --target-ref _flow/work-items`. Never hand-edit `_flow/state.yaml`.
