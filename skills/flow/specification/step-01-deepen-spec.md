# Specification — deepen one eligible work-item

Read the exact-approved product contract, required exact-approved experience contract when applicable, engineering contract and selected outlined work-item. Deepen only this work-item.

Before consequential specification decisions, resume a matching W1 checkpoint for this work item or begin one through `flow checkpoint begin --data <json>` with `phase: specification`, a stable step, target `kind: work_item_spec`, `ref: W###`, and exact upstream contract revisions as inputs. Persist meaningful decision batches and the next frontier through `flow checkpoint update --data <json>`. Keep the checkpoint compact; do not copy SPEC prose into state and never reconstruct unresolved decisions from chat history.

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

Validate and promote the SPEC. When the candidate is ready, run `flow checkpoint ready` so the approval frontier is bound to that exact SPEC revision. If the user's current instruction already authorizes proceeding and no new consequential choice was introduced, record authorization for that exact SPEC revision in the same step; supported approval recording clears the matching approval-ready checkpoint only for that revision. Otherwise route to the focused approval decision.

After authorization, route directly to task decomposition and implementation. No implementation-plan artifact or plan approval is required. Never treat SPEC existence or `maturity: ready` alone as authorization, and never rewrite completed history.
