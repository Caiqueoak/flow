# Flow

## Canonical work-items

Each `_flow/work-items/W###-*/` directory is the sole source of truth. Creating a work-item writes versionable shells for `spec.md`, `tasks.yaml`, `implementation-plan.md`, and `review.yaml`. A spec may remain `outlined`; tasks require a ready, human-approved spec. The implementation plan is a derived execution brief, never an approval artifact.

Run `flow sync` to materialize `_flow/generated/backlog.yaml` and `_flow/generated/graph.md`. Sync only reads canonical work-items and only writes `_flow/generated/`; it never alters a canonical source. Generated files are disposable and ignored by Git.

Complete a task with one commit whose exact subject is `type(domain): description [W###-T###]` and whose body contains matching `Flow-Work-Item` and `Flow-Task` trailers. Complete review with `flow work-item review-complete W### --domain domain`, which creates `chore(domain): complete review [W###]`. The review commit may contain only that item's `spec.md` and `review.yaml`; a deliberate review-time `spec.md` amendment belongs in the same commit.

CLI-first, repository-resumable delivery for coding agents. Flow keeps deterministic state, IDs, dependency routing, approvals, Git evidence, gates and migrations in the CLI while the agent owns product and engineering judgment.

## Install

```bash
npm install --save-dev @caiqueoak/flow
npx --no-install flow init --runtime codex
npx --no-install flow doctor --quick --json
```

The project records the Flow package version that initialized or explicitly updated its artifacts. Flow never checks npm or upgrades a project automatically.

## Workflow

`doctor quick → discovery → PRD → engineering → outlined backlog → selected eligible item → ready spec → spec approval → tasks and brief → implementation → gates → implementation commit → evidence persistence → review`

The backlog contains every known work-item and its DAG, but deep specs are created on demand. `spec_maturity: outlined|ready` is independent of `state: pending|in_progress|completed`. Eligibility is derived from completed dependencies plus resolved external/decision blockers; then routing uses lower priority number and lower numeric ID.

Generated `backlog.yaml` and `graph.md` are disposable projections under `_flow/generated/`. Product truth lives in `docs/prd.md`, technical truth in `docs/engineering.md`, and work-item maturity/DAG in canonical work-item specs.

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
flow task commit W015-T001 --message "feat(search): add customer query [W015-T001]" --files src/query.js,test/query.test.js
flow approval record _flow/work-items/W015-customer-search/spec.md
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

Planning is read-only and reports whether apply is allowed, including any blockers. Apply accepts forward package-version migrations, rechecks preconditions, transforms a staging copy, validates it, swaps only on success and preserves the prior `_flow` under `_flow-backups`. If an older data format cannot be converted safely, Flow creates a minimal current project and preserves the complete old directory under `_flow/docs/migration-backup/` for assisted reconciliation. Structural migration never invents semantic decisions.

## Architecture

Flow uses layered boundaries with CLI-mirrored application slices. Each `flow <command>` owns `src/application/<command>/command.ts`; public subcommands map 1:1 to files under `commands/`. Presentation parses and renders, domain modules own rules, and infrastructure makes filesystem, Git, process, persistence, projection, and runtime effects explicit.

See [the architecture guide](docs/architecture.md), [command guide](docs/commands.md), and [testing guide](docs/testing.md).

## Development

To use Flow, install Node.js 20.19.0 or later. Contributors use Node 24.x LTS;
install it with `nvm install 24` and select it with `nvm use` before installing
dependencies.

```bash
nvm use
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:package
npm run pack:check
npm run verify
```

The npm binary points at ESM build output. Source modules use strict TypeScript with NodeNext imports. The published package contains compiled source, skills and generated JSON Schemas.

## Release version

Publishing runs from `main`. After semantic-release publishes a version, CI reads the
`latest` version from npm and commits that exact value to `package.json` and
`package-lock.json`. npm is the version authority; do not manually advance these
versions for a release.

## Local push checks

Husky runs `npm run verify` before every `git push`. This is the development
validation run by CI on Node 24.x. CI also installs the generated package in a
clean Node 20.19.0 consumer project before publication.

Unit tests import source modules and never rely on `dist/`. Integration and package
tests build first, then validate the compiled CLI and published artifacts.
