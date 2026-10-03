---
name: flow
description: Repository-resumable product discovery and outcome-driven software delivery with deterministic CLI routing and Git traceability. Use /flow to start or continue.
---

# Flow

Flow is deterministic underneath and autonomous in execution. The CLI owns structural truth; the agent owns product and engineering judgment.

On every invocation:

1. Run `npx --no-install flow doctor --quick --json` first. Always do this even when the user only says to continue: migrations, manual edits or partial Flow directories may have changed repository state.
2. If doctor reports a version/migration/reconciliation problem, follow its safe recovery path before normal delivery. For an existing Flow project on an older schema/version, plan/apply the supported migration, then read `migration/step-01-reconcile.md`; preserve canonical history and never infer completion, approval or resumable decisions from artifact existence or dormant legacy cursor fields.
3. Run `npx --no-install flow sync`, `npx --no-install flow validate --json`, then `npx --no-install flow route --json`. Routing derives bootstrap progress from exact-approved canonical artifacts: approved PRD -> approved experience when the PRD requires it -> approved engineering -> at least one MVP work-item -> normal delivery.
4. Read the routed instruction and only the modular guidance relevant to that action. For implementation, read `core/orchestration.md` before `build/step-01-execute-task.md`. Use `core/decisions.md`, `core/continuation.md` and `core/recovery.md` when applicable. If route returns `finished`, compare that result with the current user intent: plain continuation means completion; a substantive new feature/change request means read `discovery/new-scope.md` and re-enter bounded discovery for only the new scope.
5. Execute the routed action, persist it, validate the minimum necessary state, route again and continue until completion or a legitimate human stop.

The user experience is: understand -> decide when necessary -> deliver -> verify -> continue. Workflow phases are internal routing, not user checkpoints.

Human stops are limited to consequential product/engineering decisions, external actions only the user can perform, genuine ambiguity with materially different outcomes, irreversible operations, or unrecoverable blockers. Give options, a recommendation and justification when asking.

For brownfield repositories without Flow, product discovery comes before engineering adoption. Inspect the repository, understand the requested product change and read `discovery/brownfield.md`; only after the PRD is approved should engineering compare observed structure with the selected profile. The profile is a recommendation baseline, never permission to refactor existing code.

Work-items are implementation outcomes. Read `backlog/work-items.md` when creating or revising the MVP graph. Planning, preparation, evidence, readiness, validation and review normally belong inside the owning work-item as tasks or gates.

Canonical delivery truth is:

- resumable decision state and active work-item/W4 concurrency intent in `_flow/state.yaml` (structural state only, never a second product/backlog SSOT);

- product contract and experience relevance in `_flow/docs/prd.md`;

- consequential experience contract in `_flow/docs/experience.md` when the approved PRD requires it;

- engineering contract in `_flow/docs/engineering.md`;

- work-item scope/acceptance and exact SPEC authorization in `spec.md`;

- decomposition/current task lifecycle in `tasks.yaml`;

- durable review/repair history in `review.yaml`;

- actual implementation in Git commits identified by W###-T### and Flow trailers.

Do not treat a derived plan as an approval or traceability artifact. Important approach/architecture decisions belong in the spec or engineering contract; ordinary implementation reasoning stays local to execution.

Preserve completed history across normal delivery and adoption. Legacy/current parsers may keep completed artifacts in their original supported schema; upgrade active/future artifacts only when required by supported runtime mutation. Never reopen or rewrite completed work-items when new scope arrives. While work is active, corrections become tasks; after completion, corrections become maintenance work-items. See `maintenance/corrections.md`.

For implementation orchestration, runtime capability names are facts, not vendor policy. Non-simple implementation must delegate through an available worker mechanism; when no worker mechanism is available, block/defer and surface the limitation rather than silently implementing directly. Genuinely simple bounded changes may remain with the orchestrator. See `core/orchestration.md`.
