---
name: flow
description: Repository-resumable product discovery and outcome-driven software delivery with deterministic CLI routing and Git traceability. Use /flow to start or continue.
---

# Flow

Flow is deterministic underneath and autonomous in execution. The CLI owns structural truth; the agent owns product and engineering judgment.

On every invocation:

1. Run `npx --no-install flow doctor --quick --json` first. Always do this even when the user only says to continue: migrations, manual edits or partial Flow directories may have changed repository state.
2. If doctor reports a version/migration/reconciliation problem, follow its safe recovery path before normal delivery.
3. Run `npx --no-install flow sync`, `npx --no-install flow validate --json`, then `npx --no-install flow route --json`.
4. Read the routed instruction and only the modular guidance relevant to that action. Use `core/decisions.md`, `core/continuation.md` and `core/recovery.md` when applicable.
5. Execute the routed action, persist it, validate the minimum necessary state, route again and continue until completion or a legitimate human stop.

The user experience is: understand -> decide when necessary -> deliver -> verify -> continue. Workflow phases are internal routing, not user checkpoints.

Human stops are limited to consequential product/engineering decisions, external actions only the user can perform, genuine ambiguity with materially different outcomes, irreversible operations, or unrecoverable blockers. Give options, a recommendation and justification when asking.

For brownfield repositories without Flow, inspect the repository first and read `discovery/brownfield.md`. The engineering profile is a recommendation baseline, never permission to refactor existing code.

Work-items are implementation outcomes. Read `backlog/work-items.md` when creating or revising the MVP graph. Planning, preparation, evidence, readiness, validation and review normally belong inside the owning work-item as tasks or gates.

Canonical delivery truth is:
- product contract in `_flow/docs/prd.md`;
- engineering contract in `_flow/docs/engineering.md`;
- work-item scope/acceptance in `spec.md`;
- decomposition in `tasks.yaml`;
- actual implementation in Git commits identified by W###-T### and Flow trailers.

Do not treat a derived plan as an approval or traceability artifact. Important approach/architecture decisions belong in the spec or engineering contract; ordinary implementation reasoning stays local to execution.

Preserve completed history. While work is active, corrections become tasks; after completion, corrections become maintenance work-items. See `maintenance/corrections.md`.
