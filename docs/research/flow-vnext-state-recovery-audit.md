# Flow vNext state persistence and recovery audit

Base audited: `main@47c3b45ea6d228636500636c92dbb1b7b755b8ae`

Scope: persisted state/artifacts, discovery state, decision drafts/checkpoints, phase approval, Doctor, recovery/resume, routing/continuation, work-item/task state, Git as durable state, and fresh-chat recovery midway through a phase. BMAD and subagent/model selection are intentionally out of scope.

## Executive summary

Flow already has a strong durable core for work-item identity, task lifecycle, exact work-item SPEC approval, derived projections, Git task evidence, and migration staging. The main recovery weakness is above that layer: decision-heavy phases have no first-class incremental checkpoint state, while routing infers progress from the mere presence/shape of final-form artifacts.

That creates a systematic fresh-chat failure mode: partial discovery, backlog mapping, task decomposition, engineering synthesis, and review can be mistaken for a completed phase boundary. Several invariants are currently stated in skills but are not enforced by the CLI. `state.yaml` is the clearest example: the domain schema models a general workflow cursor, recovery guidance calls it the current cursor, but production routing only reads its migration status and production code only writes it during migration.

The most important vNext change is therefore not another workflow layer. It is a small, explicit, atomically persisted decision/checkpoint contract that routing and Doctor both understand, plus stronger transition guards around the durable state that already exists.

## Current-state map

| State / artifact | Current owner | Durable behavior | Recovery role | Audit result |
| --- | --- | --- | --- | --- |
| `_flow/config.yaml` | `src/infrastructure/persistence/configuration.mts` | Canonical config, direct file write | Version/runtime/profile bootstrap | Keep; make canonical writes atomic |
| `_flow/docs/prd.md` | Skill-authored; validated by `src/domain/project/product-requirements-document.mts` | `status: draft|approved`, optional `approved_at` | Product phase routing | Final contract exists, but no incremental discovery checkpoint and no approval revision binding |
| `_flow/docs/engineering.md` | Skill-authored; validated by `src/domain/project/engineering-document.mts` | `status: draft|approved`, `approved_at`, baseline | Engineering phase routing | Good final contract; no incremental decision checkpoint and no approval revision binding |
| `_flow/work-items/W###-*/spec.md` | Work-item commands + specification domain | Canonical work-item scope and metadata | Specification routing | Strongest approval model: exact revision hash is bound to authorization |
| `tasks.yaml` | Task commands | `pending|in_progress|completed` | Active task and decomposition | Good task state, but decomposition has no draft/finalized boundary; current guidance assumes a single mutating task, while vNext needs explicit safety checks that permit independent intra-work-item parallel tasks |
| `review.yaml` | Review-complete command | `pending|approved` plus timestamp | Work-item completion | Final status only; no durable incremental review/checkpoint history |
| `_flow/gates.yaml` | Skill-authored + gate runtime | Canonical deterministic gates | Verification | Can remain structurally unchanged |
| `_flow/generated/backlog.yaml` / `graph.md` | `src/infrastructure/projections/project.mts` | Disposable, ignored generated projections; atomic temp+rename | Visibility only | Correctly non-canonical; keep |
| `_flow/state.yaml` | `src/domain/workflow/execution-state.mts`; migration writer | Schema models phase, step, active work, stop reason, migration | Intended cursor/recovery state | In production it is effectively migration-only; generic cursor fields are not maintained or routed |
| Git task commits | `flow task commit`, `flow trace` | W###-T### subject + trailers; SHA derived | Durable implementation evidence | Strong identity model; validation/Doctor do not currently enforce lifecycle-to-trace consistency |
| Git work-item review commit | `flow work-item review-complete` | Canonical review commit subject | Completion evidence | Useful durable boundary, but review status can be trusted without verifying the commit during routing/validation |
| Migration backups/staging | migration infrastructure | Staging/swap and backup semantics | Migration recovery | Strong specialized recovery surface; keep |

## Gaps and severity

### High — Decision-heavy phases do not persist resumable checkpoints

**Problem**

`skills/flow/discovery/step-01-project.md` requires durable decisions, rejected alternatives, assumptions, and unresolved consequential questions to be persisted, but it defines no artifact, schema, or CLI mutation that owns those values. The same gap exists for engineering and other decision-heavy phases.

A fresh chat therefore cannot reliably distinguish:

- a question already answered from one still open;
- a rejected option from an unconsidered option;
- an assumption under test from an accepted constraint;
- a partial draft from a proposal ready for approval;
- the next safe question/action from a generic phase restart.

**Evidence / files**

- `skills/flow/discovery/step-01-project.md`
- `skills/flow/engineering/step-02-synthesize.md`
- `skills/flow/core/recovery.md`
- `src/domain/workflow/execution-state.mts`
- `src/application/route/operations/route.mts`

**Current behavior**

If `prd.md` is absent or structurally invalid, route returns discovery. Once a structurally valid draft PRD exists, `projectDocumentRoute()` stops at approval solely because `status !== approved`. It has no concept of unresolved discovery dimensions. Engineering behaves the same way.

**Recommendation**

Add a first-class decision checkpoint owned by runtime persistence. At minimum it needs the fields already called out in `docs/backlog.md`: phase/subphase, resolved decisions, unresolved dimensions/questions, deferred/not-relevant dimensions, assumptions under test, latest user-authorized direction, and next safe action. Persist it after every meaningful decision batch.

Route must prefer an active checkpoint over final-artifact inference and must not enter approval while unresolved required dimensions remain.

### High — Partial backlog mapping and task decomposition are mistaken for completed phase boundaries

**Problem**

Current routing uses existence, not phase completeness.

**Fresh-chat failure cases**

1. `planning/step-01-plan-work-item.md` intends to create the complete known MVP shell map. If execution is interrupted after creating the first shell, `routeProject()` sees at least one work item and immediately routes that outlined item to specification. There is no persisted “MVP mapping is still being drafted” state.
2. `planning/step-01-create-tasks.md` intends to decompose the complete ready work item. If interrupted after creating the first task, `routeProject()` sees a non-empty task list and may immediately route that pending task to implementation. There is no “task decomposition complete” marker.

**Evidence / files**

- `skills/flow/planning/step-01-plan-work-item.md`
- `skills/flow/planning/step-01-create-tasks.md`
- `src/application/route/operations/route.mts`
- `src/application/work-item/commands/create.ts`
- `src/application/task/commands/create.ts`

**Recommendation**

Represent the phase/subphase checkpoint explicitly rather than infer it from partially materialized target artifacts. Work-item shells and tasks can continue to be written incrementally, but route must remain in the owning planning subphase until the checkpoint is finalized.

This is a runtime requirement, not skill-only guidance.

### High — PRD and engineering approval are mutable labels, not exact-revision authorizations

**Problem**

Project documents use `status: approved` + `approved_at`, but approval is not tied to the approved bytes/content revision. `src/domain/project/document.mts` already has `documentRevision()`, but routing/validation do not use it.

By contrast, work-item SPEC approval correctly stores a SHA-256 revision and `isWorkItemSpecApproved()` recomputes it.

**Evidence / files**

- `src/domain/project/document.mts`
- `src/domain/project/product-requirements-document.mts`
- `src/domain/project/engineering-document.mts`
- `src/domain/work-item/specification.mts`
- `src/application/approval/commands/record.ts`
- `src/application/route/operations/route.mts`
- `src/application/task/tests/integration/canonical-workflow.test.ts`

The canonical workflow integration test explicitly appends `changed` to an already approved `engineering.md` and then successfully starts a task. That is direct evidence that engineering authorization is not revision-bound.

**Additional transition gap**

`flow task start` verifies the work-item SPEC but does not verify that PRD/engineering are currently approved. Direct CLI use can therefore bypass route-level phase guards.

**Recommendation**

Reuse the SPEC pattern for PRD and engineering: approval metadata should include a revision fingerprint computed without the approval fields. Extend the approval command to canonical project documents and make mutating downstream commands validate required upstream approvals, not merely rely on the skill calling `route` first.

### High — `state.yaml` is modeled and documented as a workflow cursor but implemented as migration-only state

**Problem**

The execution-state domain supports:

- `execution.phase`
- `execution.step`
- active work item/task
- stop reason
- migration status

Yet production writers found in the application layer create/update `state.yaml` only during migration. `routeProject()` reads only `migration.status`; it ignores the execution cursor, active IDs, and stop reason.

Recovery guidance nevertheless says the current cursor lives in `state.yaml`.

**Evidence / files**

- `src/domain/workflow/execution-state.mts`
- `src/domain/workflow/workflow.ts`
- `src/application/migrate/operations/apply.mts`
- `src/application/route/operations/route.mts`
- `src/application/doctor/operations/doctor.mts`
- `skills/flow/reconcile/step-01-reconcile.md`
- `skills/flow/migration/step-01-reconcile.md`

**Consequences**

- The schema gives a false sense that current phase/step is durably recorded.
- Fresh-chat recovery cannot rely on the cursor described by the recovery skill.
- Migration reconciliation has no dedicated public command to transition `migration.status` to completed/clear the stop; the skill describes the mutation but runtime does not own it.

**Recommendation**

Choose one SSOT and make it real. The preferred direction is to make workflow state/checkpoint persistence first-class and have route/Doctor consume it. Do not keep dormant cursor fields that are only documentation fiction.

### High — Doctor/validate do not verify the recovery invariants needed after interruption

**Problem**

Quick Doctor verifies basic presence, config, canonical work-item parseability, and that `state.yaml` parses when present. Full Doctor delegates to `validateProject()`.

`validateProject()` currently does not verify:

- PRD/engineering approval revision integrity;
- active workflow checkpoint coherence;
- lifecycle state against Git trace evidence;
- review approval against its review commit;
- multiple active work items, or active task mutations whose dependency/change-surface/isolation constraints make them unsafe to run concurrently;
- whether a partial planning/discovery draft is being incorrectly routed forward;
- stale approval metadata after a spec/document edit.

**Evidence / files**

- `src/application/doctor/operations/doctor.mts`
- `src/application/project-validation.mts`
- `src/application/trace/operations/trace.mts`
- `skills/flow/core/recovery.md`

**Crash/recovery risk**

`flow task commit` and review completion have good exception-path rollback, but there is still a process-crash window around filesystem mutation and Git commit. If `tasks.yaml` says completed without a matching trace commit (or vice versa), current Doctor/validate do not detect that contradiction automatically.

**Recommendation**

Add a recovery consistency pass shared by Doctor, validate, and route. It should be read-only and explain the safe repair direction rather than mutate automatically.

### High — Current single-mutator guidance is not enforced, and it is too restrictive for the accepted vNext model

**Problem**

`skills/flow/invariants.md` currently says one mutating work item and task at a time across the project. That is the stale/current invariant discovered by this audit, not the accepted vNext target.

`runStart()` only checks whether another task is in progress inside the selected work item's own `tasks.yaml`. `loadWorkItems()` does not reject multiple work items that each contain an in-progress task. Route simply uses `find()` and picks one active item.

The old/generated backlog parser contains a one-`in_progress` check, but canonical work-item loading and derived projections do not use that check to enforce even the current invariant.

For vNext, the normal baseline is one active work item. Within that work item, multiple tasks/workers may run in parallel when the orchestrator determines they are genuinely independent. That decision must consider dependency relationships, change-surface overlap, shared mutable resources, available isolation, integration cost, and verification needs.

**Evidence / files**

- `skills/flow/invariants.md`
- `src/application/task/commands/start.ts`
- `src/infrastructure/persistence/work-items.mts`
- `src/domain/work-item/lifecycle.ts`
- `src/application/route/operations/route.mts`
- `src/domain/work-item/backlog.mts`

**Recommendation**

Enforce one active work item as the normal project baseline in the canonical transition boundary, validation, and Doctor. Do not enforce one globally active task.

For active tasks inside that work item, runtime should detect and prevent unsafe or conflicting concurrent mutations while permitting intentional safe parallelism. The orchestrator should choose parallel vs sequential execution from dependency, overlapping change surfaces, shared mutable resources, isolation, integration cost, and verification requirements. Routing should fail with an explicit recovery diagnosis for multiple active work items or unsafe/conflicting active task mutations; it should not reject independent intra-work-item tasks merely because another task is already active.

### Medium — Review state is not resumable and does not preserve review history

**Problem**

`review.yaml` only records `pending|approved` and an optional timestamp. `skills/flow/review/step-01-review-work-item.md` tells the agent to inspect acceptance, regressions, edge cases, traceability, and engineering conformance, but intermediate findings and re-review state are not persisted.

An interrupted review therefore loses its decision frontier and findings unless they happened to be turned into repair tasks before interruption.

**Evidence / files**

- `src/domain/work-item/review.mts`
- `src/domain/work-item/work-item.ts`
- `src/application/work-item/commands/review-complete.ts`
- `skills/flow/review/step-01-review-work-item.md`
- `docs/backlog.md` (vNext append-only review history decision)

**Recommendation**

Keep review history inside the work-item, as already decided in the backlog. Make review passes/checkpoints append-only and resumable; keep final `approved` as a derived/final disposition rather than the only durable review information.

### Medium — Canonical writes are mostly non-atomic; multi-file creation can leave partial artifacts

**Problem**

`writeText()` and `writeYaml()` use direct `fs.writeFileSync`. Work-item creation creates the directory and writes `spec.md`, `tasks.yaml`, and `review.yaml` sequentially. A process interruption can leave a truncated file or partial work-item shell.

Generated projections already use temp-file + rename, demonstrating an atomic pattern inside the repository.

**Evidence / files**

- `src/infrastructure/filesystem/files.ts`
- `src/infrastructure/filesystem/serialization/yaml.ts`
- `src/application/work-item/commands/create.ts`
- `src/infrastructure/persistence/configuration.mts`
- `src/infrastructure/projections/project.mts`

**Recommendation**

Introduce one canonical atomic-write primitive for Flow-owned state. For multi-file transitions, either stage all files in a temporary sibling directory and rename, or use a small transaction/journal marker that Doctor can recognize and recover.

### Medium — Recovery guidance contains stale/duplicated SSOT language

**Problem**

`skills/flow/reconcile/step-01-reconcile.md` says:

- work-item graph/state lives in `backlog.yaml`;
- the current cursor lives in `state.yaml`;
- graph regeneration targets `docs/graph.md`.

Current architecture instead makes each work-item folder canonical, puts disposable projections under `_flow/generated/`, and does not maintain the generic state cursor.

This is exactly the kind of duplicated/stale SSOT that makes a fresh agent unsafe.

**Evidence / files**

- `skills/flow/reconcile/step-01-reconcile.md`
- `README.md`
- `src/infrastructure/persistence/work-items.mts`
- `src/infrastructure/projections/project.mts`
- `skills/flow/SKILL.md`

**Recommendation**

After runtime checkpoint ownership is decided, rewrite recovery guidance to name only canonical owners and explicitly label generated/legacy artifacts as non-authoritative.

## Fresh-chat recovery by phase

| Interruption point | What survives today | What a fresh chat does today | Risk |
| --- | --- | --- | --- |
| Discovery before PRD materialization | Usually only chat context | Route restarts generic discovery | Prior answers/rejections can be lost or repeated |
| Discovery after structurally valid draft PRD | PRD text | Route goes to approval | Unresolved dimensions can be skipped |
| Engineering during synthesis | Draft engineering text | Valid draft routes to approval | Open engineering choices are not first-class |
| MVP work-item mapping after some shells | Partial canonical shells | Route deepens first outlined item | Mapping phase can end accidentally |
| Work-item specification while still outlined | Partial `spec.md` | Route returns specification deepen | Relatively recoverable, but unresolved decision set is implicit |
| Task decomposition after some tasks | Partial `tasks.yaml` | Route may start first task | Decomposition can end accidentally |
| Active task implementation | `in_progress` task + working tree/Git | Route returns active task | Best current recovery case; Doctor still lacks dirty/trace consistency checks |
| Review midway | Mostly chat; possibly repair tasks | Route returns review again | Findings/history must be rediscovered |
| Migration reconciliation | backup + `state.yaml` pending status | Route returns reconcile | Durable specialized state, but completion mutation is not a first-class CLI transition |

## What can remain unchanged

The following mechanisms are good foundations and should not be replaced merely to add resumability:

- Canonical per-work-item folders containing `spec.md`, `tasks.yaml`, and `review.yaml`.
- Derived `_flow/generated/backlog.yaml` and `graph.md` as disposable projections.
- Work-item SPEC exact-revision approval via `specificationRevision()`.
- Permanent W### / T### identities.
- Git task identity through canonical subject + `Flow-Work-Item` / `Flow-Task` trailers, with SHA derived by `flow trace`.
- Temporary Git index isolation and exception-path rollback in task/review commit flows.
- Derived eligibility/blocking rather than persisting redundant eligible/blocked lifecycle states.
- Migration staging/backups as specialized recovery machinery.
- The invocation cadence of Doctor -> sync -> validate -> route -> execute -> persist -> route.
- Skill ownership of qualitative product/engineering judgment.

## Recommended implementation surfaces

### 1. Make workflow checkpoint state a real domain/persistence boundary

Primary files/surfaces:

- evolve `src/domain/workflow/execution-state.mts`, or add a focused decision-checkpoint domain beside it;
- add a dedicated persistence module under `src/infrastructure/persistence/`;
- reuse the workflow phase vocabulary in `src/domain/workflow/workflow.ts`.

The persisted model should distinguish:

- active decision phase/subphase;
- draft/checkpoint status vs approval-ready status;
- resolved decisions;
- unresolved dimensions/questions;
- deferred/not-relevant dimensions;
- assumptions under test;
- last user-authorized direction;
- next safe action;
- active work item/task when applicable.

Avoid copying canonical PRD/engineering/spec content into the checkpoint. Store references/revisions and only the temporary decision state needed to resume.

### 2. Add explicit checkpoint transitions

Add a small application/CLI surface for deterministic checkpoint writes instead of requiring skills to invent direct file edits. The exact command naming can be decided during implementation, but it should support at least:

- start/update checkpoint;
- mark a decision dimension resolved/deferred;
- mark a draft approval-ready;
- clear/archive the checkpoint only after canonical approved state is safely persisted.

Use this for discovery first, then engineering, backlog mapping, task decomposition, and review where needed.

### 3. Extend exact-revision approval to project contracts

Primary files/surfaces:

- `src/domain/project/document.mts`;
- `src/application/approval/**`;
- PRD/engineering validators;
- `src/application/route/operations/route.mts`;
- downstream mutation guards.

Reuse `documentRevision()` and the work-item SPEC approval pattern. Approved project documents must become invalid for downstream transitions as soon as their content changes.

### 4. Centralize transition guards

Introduce one domain/application transition boundary used by mutating commands, not only route. It should enforce:

- approved current PRD/engineering where required;
- exact approved work-item SPEC;
- one active work item as the normal baseline, while allowing multiple active tasks inside it only when concurrency is judged safe from dependencies, change-surface overlap, shared mutable resources, isolation, integration cost, and verification needs;
- legal task dependency state;
- no forward transition while the owning checkpoint is incomplete.

Route remains read-only and explanatory, but direct CLI mutations cannot bypass the same rules.

### 5. Upgrade Doctor/validate into recovery consistency checks

Primary files/surfaces:

- `src/application/doctor/operations/doctor.mts`;
- `src/application/project-validation.mts`;
- `src/application/trace/operations/trace.mts`.

Add checks for:

- checkpoint vs canonical artifact revision;
- stale/missing approval revision;
- multiple active work items;
- unsafe/conflicting active task mutations within the active work item, without treating safe intentional intra-work-item parallelism as an error;
- completed task without canonical Git trace and canonical trace without matching lifecycle state;
- approved review without its canonical review commit;
- incomplete/partial Flow transactions;
- stale generated projections (already present; keep);
- migration/checkpoint state that has no legal continuation.

Doctor should report recovery instructions; it should not guess or replay mutations.

### 6. Make Flow-owned canonical file writes atomic

Primary files/surfaces:

- `src/infrastructure/filesystem/files.ts`;
- `src/infrastructure/filesystem/serialization/yaml.ts`;
- all canonical persistence writers.

Generalize the temp-file + rename pattern already used by `src/infrastructure/projections/project.mts`. Add transaction semantics for multi-file work-item creation and any checkpoint-to-approved transition that changes more than one canonical file.

### 7. Update skills only after runtime ownership exists

Primary skills:

- `skills/flow/SKILL.md`
- `skills/flow/core/continuation.md`
- `skills/flow/core/recovery.md`
- `skills/flow/discovery/step-01-project.md`
- `skills/flow/discovery/step-02-await-approval.md`
- `skills/flow/engineering/step-02-synthesize.md`
- `skills/flow/engineering/step-05-present.md`
- `skills/flow/planning/step-01-plan-work-item.md`
- `skills/flow/planning/step-01-create-tasks.md`
- `skills/flow/review/step-01-review-work-item.md`
- `skills/flow/reconcile/step-01-reconcile.md`
- `skills/flow/migration/step-01-reconcile.md`

The skills should say when and why to checkpoint; the runtime should own how the checkpoint is validated, written, transitioned, and cleaned up.

## Runtime enforcement vs skill-only guidance

| Concern | Runtime enforcement | Skill-only guidance |
| --- | --- | --- |
| Checkpoint schema, ownership and atomic persistence | Required | No |
| Whether unresolved required decisions block approval/forward routing | Required | Skill decides what is consequential/relevant |
| Exact-revision PRD/engineering/SPEC authorization | Required | Skill presents recommendation and asks the human |
| One active work item baseline; safe/conflicting intra-work-item task concurrency checks | Required | Orchestrator/skill decides parallel vs sequential execution using dependency, overlap, shared-resource, isolation, integration, and verification context |
| Legal lifecycle/dependency transitions | Required | No |
| Git trace ↔ lifecycle consistency | Required | Skill interprets unusual evidence when recovery is ambiguous |
| Draft cleanup after approval | Required and idempotent | Skill should not manually remember cleanup |
| Partial-write detection/recovery state | Required | Skill can explain the repair |
| What questions to ask and how many | No | Skill |
| Product/engineering recommendation and rationale | No | Skill |
| Whether an implementation detail is consequential | Structural boundary in runtime; judgment in skill | Skill |
| Review lenses and qualitative findings | Persisted structure required; content is judgment | Skill |
| Fresh-chat rehydration sequence | Runtime supplies authoritative state | Skill reads/summarizes it and continues |

## Draft cleanup rule

Current PRD/engineering/spec artifacts reuse one file for draft and approved content, so there is no separate temporary draft file to clean today. vNext decision checkpoints are different: they are temporary resumability state.

When approval succeeds:

1. verify the canonical artifact revision being approved;
2. persist approval;
3. validate resulting canonical state;
4. clear the corresponding checkpoint/draft in the same recoverable transition;
5. route from canonical approved state.

If step 4 cannot be made atomic with approval, Doctor must recognize “approved artifact + stale checkpoint” and deterministically finish cleanup without re-asking the decision.

## Validation scenarios vNext should add

Add integration tests that intentionally interrupt and resume at these points:

- after one discovery answer/checkpoint but before PRD completion;
- after a valid PRD draft with unresolved required dimensions;
- after one of several planned work-item shells;
- after one of several planned tasks;
- after engineering draft mutation following approval;
- with two work items containing in-progress tasks, which should be diagnosed against the one-active-work-item baseline;
- with two independent tasks in the same active work item, which should remain valid when concurrency safety checks pass;
- with two conflicting tasks in the same active work item, which should be blocked or diagnosed before concurrent mutation;
- after task-state write but before/without a matching Git evidence commit;
- after a matching task commit with stale local lifecycle state;
- midway through review with persisted findings;
- after approval succeeds but checkpoint cleanup is interrupted;
- after migration reconciliation is completed and must clear the migration stop.

The acceptance criterion is not only that parsing succeeds. A fresh invocation must route to the same next safe action that the interrupted invocation would have taken with its chat context intact.

## Conclusion

Flow's durable delivery core is useful and should be preserved. The vNext gap is that “repository-resumable” is currently strongest during implementation and weakest during decisions/planning/review. The highest-leverage fix is to make incremental checkpoint state explicit, revision-aware, atomic, and part of route/Doctor truth. Once that exists, skills can remain adaptive while fresh chats stop depending on remembered conversation state.
