# Specification — deepen one eligible work-item

Read the product contract, engineering contract and selected outlined work-item. Deepen only this work-item.

The SPEC defines the bounded implementation outcome. Include:

- Problem

- Scope

- Non-goals

- Requirements

- observable Acceptance criteria

- Contracts

- Data and APIs when relevant

- realistic Edge cases that could violate acceptance, integrity, security, idempotency or user expectations

- Risks

- Decisions

- Gates

Resolve ordinary implementation details autonomously from engineering. If a consequential unresolved product/engineering choice remains, use `../core/decisions.md`.

Validate and promote the SPEC. If the user's current instruction already authorizes proceeding and no new consequential choice was introduced, record authorization for that exact SPEC revision in the same step. Otherwise route to the focused approval decision.

After authorization, route directly to task decomposition and implementation. No implementation-plan artifact or plan approval is required. Never rewrite completed history.
