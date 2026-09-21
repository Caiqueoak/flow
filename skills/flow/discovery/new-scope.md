# New scope after completion

A deterministic `flow route --json` result of `finished` means the currently mapped work is complete. It does not override a substantive new request in the current `/flow` invocation.

When route is `finished`:

- If the user only asks to continue/resume with no new scope, stop as finished.
- If the user supplies a new feature, behavior change, requirement, integration or other bounded product intent, treat that intent as a new delivery scope and perform proportional discovery before creating work-items.

For new scope:

1. Read the approved PRD, approved engineering contract, completed work-item outcomes and the relevant repository area.
2. Understand the new request and its affected product behavior. Do not rediscover unrelated parts of the project.
3. Decide whether the approved PRD still covers the request:
   - if yes, reuse it unchanged;
   - if product assumptions/scope materially change, revise only the affected PRD sections, set it to draft, and require consequential approval before delivery.
4. Decide whether the approved engineering contract still covers the request:
   - if yes, reuse it unchanged;
   - if architecture, boundaries, operational assumptions or adoption strategy materially change, revise only the affected engineering sections, set it to draft, and require consequential approval.
5. Map the new scope into new outcome work-items with new W### identities. Never reopen, renumber, rewrite or append tasks to completed work-items.
6. Sync, validate, route and continue normally.

Prefer the smallest justified contract change. Existing approved contracts remain authoritative everywhere the new request does not invalidate them.
