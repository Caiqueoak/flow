# Engineering bootstrap — enforcement

## Objective
Ensure the proposed engineering contract is enforceable before asking for approval.

## Required actions
For every important rule ask: can this be checked deterministically?

- If yes, select/configure a command or builtin static gate.
- If no but judgment can reliably assess it, map it to a versioned agentic profile such as `flow/maintainability@1`.
- If neither is reliable, mark it advisory rather than pretending it is enforced.

Prefer existing project tooling when suitable. If tooling is missing, propose the smallest ecosystem-standard tool that enforces the rule. Do not install/configure new project dependencies until the developer approves the engineering proposal.

Create/update `.flow/gates.yaml`. Add an enforcement mapping in `engineering.md` for every blocking rule using the deterministic form `- ENG-CODE-001 → maintainability` (with the actual rule and gate IDs).

Before leaving this step, create/update `.flow/state.yaml` with `execution.phase: engineering_bootstrap`, `execution.step: review`, and `stop_reason: null`.

## NEXT
Continue to engineering review.
