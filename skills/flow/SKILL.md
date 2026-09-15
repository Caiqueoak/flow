---
name: flow
description: CLI-first repository-resumable delivery through deep discovery, approved product/engineering contracts, progressive specs, atomic task commits and review. Use /flow to start or continue.
---

# Flow

Read `invariants.md` once per invocation. Use only the project-local CLI (`npx --no-install flow`); never fetch or substitute another Flow version automatically.

1. Run `npx --no-install flow doctor --quick --json`. A version difference requires an explicit user decision and, when needed, `flow migrate --plan` before `--apply`.
2. Run `npx --no-install flow route --json`.
3. Read the returned instruction and every `required_context` file. Planning, implementation and review require the full approved `engineering.md` immediately before the step.
4. Execute only that step. Use CLI commands for IDs, states, dependencies, blockers, approvals, cursor, task evidence, graph and every other deterministic mutation. The agent owns qualitative product, architecture, spec, decomposition and trade-off reasoning.
5. Run the indicated minimum validation, persist through the CLI, then route again until a real human decision, external action, unrecoverable blocker or completion.

Never approve your own proposal or infer consent. Approval records the exact document revision and ISO timestamp. A revision requires new approval.

Artifact ownership: `docs/prd.md` is product truth; `docs/engineering.md` is technical truth; `backlog.yaml` contains the complete outlined DAG and canonical `spec_maturity`; an eligible work-item receives `spec.md` on demand; `tasks.yaml` and `implementation-plan.md` exist only after readiness; `state.yaml` is only the cursor; `gates.yaml` contains executable checks; `docs/graph.md` is derived. Preserve completed history. Later corrections become a new task or maintenance work-item.

Engineering changes go through reconcile. A profile is bootstrap input, never a competing policy engine. Product-impacting technical decisions explicitly update the affected product contract.
