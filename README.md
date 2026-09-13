# Flow

Repository-resumable software delivery with deterministic workflow checks and explicit human approval.

## Install and use

```bash
npm install --save-dev @caiqueoak/flow
npx --no-install flow init --runtime codex
```

Invoke `/flow` to start or continue. The agent routes from repository state, reads the returned instruction/context, executes one step, persists artifacts, validates and routes again. Consequential decisions require explicit human input; status updates alone are not terminal stops.

## Engineering preferences

The single built-in template is **Readability First**, ID `flow/readability-first@1`. It covers Clean Code, SOLID, mandatory SRP, semantic naming, low coupling, high cohesion, vertical slices, modular ownership, locality and complexity justified by demonstrable value.

The agent-readable template ships with the npm package and is installed with the runtime skill. It is loaded when generating or explicitly revising engineering, not on every task. The approved `.flow/docs/engineering.md` is the project engineering source of truth and must be read in full before planning, implementation and review. Package/profile updates never silently change that contract.

For existing code, `--existing-code improve` (**Improve existing structure**) treats current style as evidence, not authority; `preserve` (**Keep existing structure**) gives consistent conventions stronger weight. Both preserve behavior and external contracts; neither authorizes automatic refactoring. New projects use `not_applicable` when no meaningful code exists.

## Lifecycle and approval

Discovery → PRD approval → engineering approval → complete backlog planning → implementation-plan approval → serial implementation → review.

After product and engineering are approved, create every known work item's directory, `spec.md` and `tasks.yaml` before implementation. Then draft a concrete `implementation-plan.md` per selected work item and request human validation. It identifies exact paths, symbols/contracts, ordered changes, task mapping, engineering compliance, tests, risks, rollback and exclusions. Approval is tied to SHA256 revisions of the exact engineering and spec documents; stale plans return to drafting.

PRD, engineering and plans use YAML frontmatter with `schema_version: 1`, `status: draft|approved`, and `approved_at` when approved. Engineering records baseline profile and existing-code policy. Plans record work_item, engineering_revision and spec_revision. Completed work retains its historical approval; later outcome records or engineering changes do not retroactively invalidate completed delivery.

## Canonical artifacts

- `config.yaml`: runtime/bootstrap preferences; installed package metadata owns version.
- `docs/prd.md`: product truth; `docs/engineering.md`: approved engineering truth.
- `backlog.yaml`: schema 2, W### IDs, W###-kebab-case folders, kinds, priority, dependency DAG and lifecycle.
- `work-items/W###-slug/spec.md`: bounded scope and decisions; `tasks.yaml`: schema 1, work_item, local T### task DAG.
- `implementation-plan.md`: human-approved implementation approach.
- `state.yaml`: resume cursor and migration reconciliation status.
- `gates.yaml`: schema 1, command/builtin checks only; qualitative judgment remains review instructions.
- `docs/graph.md`: deterministic derived projection; regenerate rather than hand-edit.

Persist only pending, in_progress and completed. Ready/Blocked are derived from dependency edges and explicit blockers. Blockers use `{id, type: external_action|consequential_decision, description, status: unresolved|resolved}`. Only one mutating work item/task may be active across the project. Read-only analysis may be parallel; automatic concurrent worktrees are out of scope.

## CLI

All commands use the local installation:

| Command                                 | Purpose                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `npx --no-install flow init`            | Configure or add/refresh runtime integrations.                              |
| `npx --no-install flow migrate`         | Atomic structural migration, followed by semantic reconciliation via /flow. |
| `npx --no-install flow status`          | Progress and dependency/external blockers.                                  |
| `npx --no-install flow validate`        | Artifact integrity, approvals, DAGs, traceability and deterministic gates.  |
| `npx --no-install flow route --json`    | Next legal step and required context.                                       |
| `npx --no-install flow graph`           | Regenerate dependency graph.                                                |
| `npx --no-install flow trace W015-T003` | Resolve a task's implementation commit.                                     |

Use `--help` for options; `--path` selects a project. Existing managed projects cannot change engineering through init; use /flow and approval. Older config is refused without mutation and must be migrated first. Update with your package manager, then rerun init to refresh integrations; there is no separate update/config/gates workflow command.

## Git and migration

New completed code tasks have exactly one HEAD-reachable implementation commit with both trailers:

```text
Flow-Work-Item: W015
Flow-Task: W015-T003
```

Non-code tasks use implementation: none. SHA is derived, not canonical task identity. Pre-commit verification uses `validate --pre-commit W015-T003`; normal validation checks the integrated commit. Avoid squashing task commits when preserving task traceability.

Migration stages transformations before swapping artifacts, rejects collisions/invalid DAGs before mutation, preserves legacy documents and commit evidence, normalizes qualified task IDs/dependencies, and routes first to semantic reconciliation. Completed migrated tasks use implementation: legacy and optional legacy_commit; they do not require invented Git trailers or rewritten historical spec headings. Pending legacy folders may be absent during reconciliation, but complete backlog planning must materialize them before native implementation. Private project artifacts are not committed as fixtures.

## Releases

Merges to main are released automatically after the test matrix passes. Conventional Commit PR titles drive semantic-release. Installed package metadata is the Flow version source of truth; project config does not duplicate it.
