---
name: flow
description: CLI-first repository-resumable delivery through deep discovery, approved product/engineering contracts, progressive specs, atomic task commits and review. Use /flow to start or continue.
---

# Flow

Read `invariants.md` once per invocation. Use only the project-local CLI (`npx --no-install flow`); never fetch or substitute another Flow version automatically.

1. Run `npx --no-install flow doctor --quick --json`. A version difference requires an explicit user decision and, when needed, `flow migrate --plan` before `--apply`.
2. Run `npx --no-install flow sync`, then `npx --no-install flow validate --json`, then `npx --no-install flow route --json`.
3. Read the returned instruction and every `required_context` file. Planning, implementation and review require the full approved `engineering.md` immediately before the step.
4. Execute only that step. Use CLI commands for IDs, dependencies, blockers, approvals, task evidence and every other deterministic mutation. The agent owns qualitative product, architecture, spec, decomposition and trade-off reasoning.
5. Run the indicated minimum validation, persist through the CLI, then route again until a real human decision, external action, unrecoverable blocker or completion.

Never approve your own proposal or infer consent. If the user's current instruction explicitly authorizes proceeding with the finalized work-item SPEC, record that exact revision in the same specification step; otherwise stop at the specification approval route. Approval records the exact document revision and ISO timestamp. A later material revision requires new approval.

Artifact ownership: every `_flow/work-items/W###-*/` directory is canonical and always contains `spec.md`, `tasks.yaml`, `implementation-plan.md`, and `review.yaml`. Spec frontmatter owns work-item metadata and `maturity`; lifecycle is derived from it, tasks, dependencies, blockers and review. `gates.yaml` contains executable checks. `backlog.yaml` and `graph.md` under `_flow/generated/` are disposable projections: `sync` only reads canonical work-items and only writes that directory. Never commit generated projections. A task is completed by one canonical subject `type(domain): description [W###-T###]`; review completion uses `chore(domain): complete review [W###]`. A deliberate review-time spec edit belongs in that review commit, and nothing outside its work-item folder may enter it. Preserve completed history. Later corrections become a new task or maintenance work-item.

Engineering changes go through reconcile. A profile is bootstrap input, never a competing policy engine. Product-impacting technical decisions explicitly update the affected product contract.
