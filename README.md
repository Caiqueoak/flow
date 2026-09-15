# Flow

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
flow task create W015 --title "Add query contract" --traceability commit
flow task start W015-T001
flow scope validate W015-T001
flow task commit W015-T001 --message "feat: add customer query [W015-T001]"
# Recovery when the commit exists but metadata persistence failed:
flow task complete W015-T001
flow approval record _flow/work-items/W015-customer-search/implementation-plan.md
flow state update --phase implementation --step execute_task --work-item W015 --task W015-T001
flow graph
```

Batch accepts a YAML/JSON list (or `{operations: [...]}`) from `--file` or `--stdin`. All operations are applied against staging and validated before `_flow` is swapped; any failure leaves the live project unchanged.

## Git traceability

`W###-T###` is permanent task identity. A repository-mutating native task uses `traceability: commit` and exactly one coherent implementation commit. Its objective message contains the task ID and its body contains:

```text
Flow-Work-Item: W015
Flow-Task: W015-T003
```

After the commit, `flow task complete W015-T003` resolves the unique reachable trailer match and stores the full Git object ID as `commit_sha`. Metadata persistence is a separate administrative change without Flow trailers. `flow trace` reports task/work-item records, persisted and currently resolved SHA, divergence, title, trailers, changed files and artifact paths. `none` is for deliberate non-repository work; `legacy` is migration-only.

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

The npm binary points at strict-TypeScript-built ESM. The published package contains compiled source, skills and generated JSON Schemas.
