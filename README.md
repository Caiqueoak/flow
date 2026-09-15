# Flow

## Canonical work-items

Each `_flow/work-items/W###-*/` directory is the sole source of truth. Creating a work-item writes versionable shells for `spec.md`, `tasks.yaml`, `implementation-plan.md`, and `review.yaml`. A spec may remain `outlined`; tasks require a `ready` spec and implementation requires an approved plan.

Run `flow sync` to materialize `_flow/generated/backlog.yaml` and `_flow/generated/graph.md`. Sync only reads canonical work-items and only writes `_flow/generated/`; it never alters a canonical source. Generated files are disposable and ignored by Git.

Complete a task with one commit whose exact subject is `type(domain): description [W###-T###]` and whose body contains matching `Flow-Work-Item` and `Flow-Task` trailers. Complete review with `flow work-item review-complete W### --domain domain`, which creates `chore(domain): complete review [W###]`. The review commit contains only canonical artifacts in that work-item folder. Any deliberate `spec.md` review change belongs in that same commit; nothing outside that folder may enter it.

CLI-first, repository-resumable delivery for coding agents. Flow keeps deterministic state, IDs, dependency routing, approvals, Git evidence, gates and migrations in the CLI while the agent owns product and engineering judgment.

## Install

```bash
npm install --save-dev @caiqueoak/flow
npx --no-install flow init --runtime codex
npx --no-install flow doctor --quick --json
```

The project records the Flow package version that initialized or explicitly updated its artifacts. Flow never checks npm or upgrades a project automatically.

## Workflow

`doctor quick → discovery → PRD → engineering → outlined backlog → selected eligible item → ready spec → tasks and plan → approval → implementation → gates → implementation commit → evidence persistence → review`

The backlog contains every known work-item and its DAG, but deep specs are created on demand. `spec_maturity: outlined|ready` is independent of `state: pending|in_progress|completed`. Eligibility is derived from completed dependencies plus resolved external/decision blockers; then routing uses lower priority number and lower numeric ID.

`state.yaml` contains only the execution cursor. Product truth lives in `docs/prd.md`, technical truth in `docs/engineering.md`, and work-item maturity/DAG in `backlog.yaml`.

## CLI

Run `flow --help` or `flow <command> --help`. Help and parsing share one declarative command registry, so unknown flags and invalid combinations are rejected before writes.

Core read operations:

```bash
flow doctor --quick --json
flow status
flow route --json
flow validate [--work-item W015] [--gates]
flow trace W015-T003
flow gates list|run [--id ID|--task W015-T003|--work-item W015|--stage task|work-item-review|full|--all]
```

Structured writes:

```bash
flow work-item create --title "Customer search" --priority 2
flow work-item dependencies W015 --depends-on W003,W009
flow work-item blocker-add W015 --id vendor-approval --type external_action --description "Vendor approval"
flow work-item blocker-resolve W015 --id vendor-approval
flow work-item promote W015
flow task create W015 --title "Add query contract"
flow task start W015-T001
flow scope validate W015-T001 --files src/query.js,test/query.test.js
flow task commit W015-T001 --message "feat: add customer query [W015-T001]" --files src/query.js,test/query.test.js
flow approval record _flow/work-items/W015-customer-search/implementation-plan.md
```

## Git traceability

`W###-T###` is permanent task identity. A repository-mutating task creates exactly one coherent implementation commit. Its objective message contains the task ID for human visibility and its body contains the canonical machine evidence:

```text
Flow-Work-Item: W015
Flow-Task: W015-T003
```

`flow trace W015-T003` resolves a unique reachable commit only when its subject and both trailers agree. SHA evidence is never stored in tasks.yaml. `flow trace W015` aggregates reachable implementation commits by `Flow-Work-Item`, including task, SHA, title and changed files.

## Gates and performance

`flow validate` performs cheap structural checks and does not run the project test suite. `--gates` is explicit. Gates declare stage (`task`, `work-item-review`, `full`), expected cost and optional task/work-item scope. JSON output includes duration, process and Git-read metrics. Engineering maps changed paths/contracts to the smallest safe test scope and falls back to broader checks when impact is unknown.

## Migration

```bash
flow doctor
flow migrate --plan --json
flow migrate --apply
```

Planning is read-only. Apply rechecks preconditions, transforms a staging copy, validates it, swaps only on success and preserves the prior `_flow` under `_flow-backups`. Structural migration never invents semantic decisions; ambiguous legacy truths route to assisted reconcile.

## Development

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:package
npm run pack:check
```

The npm binary points at ESM build output. Runtime sources remain JavaScript in this staged packaging migration and are not strict TypeScript-checked; a full source conversion is intentionally separate. The published package contains compiled source, skills and generated JSON Schemas.
