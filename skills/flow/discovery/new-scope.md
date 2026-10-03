# New scope after completion

A deterministic `flow route --json` result of `finished` means the currently mapped work is complete. It does not override a substantive new request in the current `/flow` invocation.

When route is `finished`:

- If the user only asks to continue/resume with no new scope, stop as finished.
- If the user supplies a new feature, behavior change, requirement, integration or other bounded product intent, treat that intent as a new delivery scope and re-enter proportional PRD discovery before creating work-items.

## Resume before rediscovery

Substantive new scope uses the same W1 PRD checkpoint as normal discovery; there is no second new-scope state or product SSOT.

Before making consequential new-scope decisions, inspect `_flow/state.yaml`:

- if an active discovery checkpoint targets `_flow/docs/prd.md`, resume its persisted dimensions, assumptions, latest authorized direction and `next_frontier`;
- otherwise begin one with `flow checkpoint begin --data <json>` using `phase: discovery`, a stable discovery step, target `kind: project_document`, target `ref: _flow/docs/prd.md`, and compact exact-revision inputs where they matter.

Persist each meaningful decision batch with `flow checkpoint update --data <json>`. Record only bounded decision state; PRD/experience/engineering prose remains in its canonical document.

For the new scope, assess proportionally:

1. affected product behavior, assumptions, requirements, constraints and non-goals;
2. whether experience definition is consequential for the changed scope and whether the PRD's `experience: required|not_required` decision must change;
3. whether architecture, boundaries, operations, security, data/API contracts or adoption strategy create a consequential engineering impact;
4. whether the approved PRD and engineering contract remain valid unchanged or need a bounded draft revision.

Represent consequential dimensions explicitly in the checkpoint. A dimension may be `resolved`, `deferred` with a concrete revisit condition, or `not_relevant`; unresolved dimensions stay in `next_frontier`. Do not run `flow checkpoint ready` while any relevant product, experience-relevance or engineering-impact dimension remains unresolved or while assumptions are still under test.

When the bounded discovery is coherent:

1. materialize only the required PRD revision, keeping unaffected approved product truth intact;
2. run `flow checkpoint ready` only when an exact PRD candidate exists and every consequential dimension is resolved/deferred/not relevant;
3. obtain exact-revision PRD approval when the PRD changed; if it remains unchanged, clear/resolve the checkpoint through the supported lifecycle without fabricating a new approval;
4. revise experience and/or engineering through their normal checkpointed flows when the new scope makes those contracts consequentially stale;
5. map the new scope into new outcome work-items with new W### identities. Never reopen, renumber, rewrite or append tasks to completed work-items;
6. sync, validate, route and continue normally.

Prefer the smallest justified contract change. Existing approved contracts remain authoritative everywhere the new request does not invalidate them.
