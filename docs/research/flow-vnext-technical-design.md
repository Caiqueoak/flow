# Flow vNext technical design

Status: final synthesis for implementation planning  
Base: main@47c3b45ea6d228636500636c92dbb1b7b755b8ae

Research inputs:

- PR #48 — state/recovery audit at 8d13d082caea780b3a1b8e6fb97ac44ee36a2bc9
- PR #49 — BMAD harvest at e19421b2cf2dba802b4643ea2852d3885812ed24
- PR #50 — worker efficiency at 83119198cae516fa515cbb78098aaa25404f81d3
- PR #51 — evaluation strategy at 67f1c4926a5dde7721fabfe45596002b5b241173

This design keeps docs/backlog.md and accepted reviewer corrections authoritative when research recommendations conflict with settled Flow decisions.

## 1. Architecture summary

Flow vNext remains a CLI-first, repository-resumable system with skill-driven judgment above a small deterministic core.

The smallest coherent target adds five capabilities to the current design:

1. make _flow/state.yaml own a real temporary resumability checkpoint instead of a mostly dormant workflow cursor;
2. bind PRD, optional experience, engineering and work-item specification approvals to exact content revisions;
3. make route, validate and Doctor share structural recovery rules, including safe intra-work-item mutation concurrency;
4. evolve each work item's review.yaml into resumable append-only review/repair history;
5. add runtime-agnostic orchestration guidance for worker capability detection, minimum-sufficient handoffs, cheapest-capable model routing and safe parallelism.

Flow does not gain a rigid workflow engine, a permanent decision-event journal, a fixed worker graph, a fixed worker count, or vendor-specific orchestration code.

The ownership rule is:

> Skills decide what the work means and what judgment is appropriate. The runtime persists and validates the minimum structural facts needed to recover, authorize, mutate and verify safely.

## 2. Target lifecycle

### 2.1 Invocation and recovery

Every invocation keeps the existing high-level cadence:

1. Doctor quick check;
2. sync disposable projections;
3. validate canonical state;
4. route to the next safe action;
5. execute the routed skill/action;
6. persist the result;
7. validate the minimum required state;
8. route again.

Before normal routing, Doctor/validation must reject consequential inconsistent state. A fresh chat reconstructs the same next safe action from repository and Git evidence without requiring prior transcript context.

### 2.2 Discovery

Discovery begins or resumes a temporary checkpoint targeting _flow/docs/prd.md.

The discovery skill:

- identifies product dimensions dynamically;
- tracks each relevant dimension as resolved, unresolved, deferred or not_relevant;
- asks dependency-aware batches;
- records recommendations/rationale when useful;
- keeps assumptions explicit;
- performs a bounded challenge pass before consequential finalization.

The checkpoint is persisted after each meaningful decision batch. PRD finalization is blocked while any relevant consequential dimension remains unresolved.

When discovery is complete:

1. materialize/update the PRD draft;
2. mark the checkpoint approval_ready with the exact target revision;
3. obtain human approval;
4. record exact-revision approval in the PRD;
5. clear the matching checkpoint.

If approval succeeds and cleanup is interrupted, Doctor recognizes the approved matching target and safely finishes checkpoint cleanup.

### 2.3 Experience when relevant

Experience is first-class only when the approved PRD says the current scope requires it.

For new vNext PRDs, frontmatter records experience: required or not_required. The skill decides this based on the product; the runtime only routes the persisted result.

If required, _flow/docs/experience.md becomes the optional canonical experience contract. The skill chooses the minimum useful artifact depth: journeys/interactions, wireframes, or prototype/specification-by-example as needed. The approved experience document owns consequential interaction/behavior constraints; prototypes and mockups remain supporting examples.

Experience uses the same checkpoint and exact-revision approval mechanics as PRD and engineering.

### 2.4 Engineering

Engineering resumes from approved upstream contracts and a checkpoint targeting _flow/docs/engineering.md.

engineering.md remains the normative architecture/topology contract. The checkpoint records only unresolved engineering decisions, assumptions, references and the next frontier; it does not copy the engineering document.

Before approval, consequential assumptions are pressure-tested. Approval is exact-revision bound. Any later material engineering edit invalidates authorization until the new revision is approved.

### 2.5 Backlog mapping and specification

Backlog mapping remains adaptive and shallow: create the complete known outcome map, not implementation-phase work items.

The first persisted work-item shell starts a planning checkpoint. That checkpoint stays active until the skill explicitly declares the known mapping structurally complete. Route must not infer completion merely because one work item exists.

An outlined work item enters specification. If specification contains consequential unresolved choices, a checkpoint targets that spec. The existing spec.md remains the bounded work-item contract and exact-revision approval model is retained.

### 2.6 Task planning

After exact spec approval, task decomposition starts a planning checkpoint owned by the selected work item.

tasks.yaml may be written incrementally, but route must not treat a non-empty task list as completed decomposition while that checkpoint remains active. The skill decides when decomposition is coherent and complete; the runtime validates structure before clearing the checkpoint.

No implementation-plan artifact or plan approval is introduced.

### 2.7 Work-item execution

One active work item is the normal delivery baseline. The active focus is durable in state.yaml until final work-item acceptance/integration.

Tasks retain the lifecycle:

- pending
- in_progress
- completed

Multiple in_progress tasks are allowed inside the active work item only when deterministic concurrency guards can prove there is no declared dependency/change-surface/shared-resource conflict. The orchestrator still decides whether parallel execution is worthwhile.

Non-simple implementation must delegate meaningful responsibility to one or more workers. If the active runtime cannot provide workers, that implementation responsibility blocks or defers until the orchestrator switches to a capable runtime or uses another explicit worker mechanism; it must not silently absorb the implementation itself. Genuinely simple and bounded implementation may still be performed directly by the orchestrator, and ordinary orchestrator responsibilities such as user interaction, synthesis, integration judgment and review do not require worker availability. A cohesive responsibility may still be handled by one worker; Flow never maps worker count mechanically to task count.

### 2.8 Review and repair

review.yaml becomes the durable review record for the work item.

Review may happen at task or work-item scope. Each finalized pass is append-only and includes a human-readable parecer, inspected scope/evidence, findings, orchestrator dispositions, repair links, later resolutions and residual risk.

A mutable active_pass inside review.yaml is allowed only as temporary resumability state. Finalizing a pass appends it to immutable pass history and removes active_pass in one atomic file write.

Blocking findings must be resolved, explicitly accepted as residual risk by the appropriate authority, superseded with evidence, or remain open. A work item cannot reach approved while a blocking finding remains unresolved.

Repairs are normal tasks inside the active work item. Re-review uses fresh reasoning when practical but reads prior history so unchanged findings do not oscillate or disappear.

### 2.9 Completion and resume

After final review and user checkpoint where required:

1. the work-item review disposition becomes approved;
2. canonical review Git evidence is persisted;
3. the work-item PR leaves draft/integrates according to repository policy;
4. temporary worker worktrees/branches are cleaned up;
5. state.active.work_item is cleared;
6. route selects the next eligible work item or finishes.

The user controls whether the orchestrator chat continues or is replaced. Flow only guarantees that a fresh chat can resume.

## 3. Persisted state model

### 3.1 _flow/state.yaml

state.yaml becomes a small structural envelope, not a second product/engineering contract.

Target shape:

```yaml
schema_version: 3

migration:
  status: not_required

active:
  work_item: W004

checkpoint:
  phase: engineering
  step: synthesize
  target:
    kind: project_document
    ref: _flow/docs/engineering.md
    revision: 3f2d...
  status: active
  inputs:
    - ref: _flow/docs/prd.md
      revision: 7a11...
    - ref: _flow/docs/experience.md
      revision: a990...
  dimensions:
    - id: D001
      state: resolved
      summary: Keep one work-item branch as the integration boundary.
      rationale: Optional short rationale needed for resume.
    - id: D002
      state: unresolved
      summary: Select cache invalidation ownership.
    - id: D003
      state: deferred
      summary: Multi-region deployment.
      revisit: Revisit before multi-region scope.
  assumptions:
    - id: A001
      state: testing
      summary: Current database latency is acceptable.
  latest_authorized_direction: Prefer repository-first recovery with minimal runtime state.
  next_frontier:
    - D002
  updated_at: 2026-10-02T09:00:00Z
```

checkpoint is null when no temporary decision/planning checkpoint exists.

The checkpoint has only these responsibilities:

- identify the active decision/planning phase and subphase;
- preserve compact decisions needed to resume before approval;
- preserve unresolved/deferred/not-relevant dimensions;
- preserve live assumptions;
- reference exact upstream/target revisions;
- identify the next safe decision frontier.

It must not contain full PRD, experience, engineering, spec or review content.

Stable dimension IDs are required only when a dimension must survive turns or be referenced elsewhere. Tiny ephemeral discussion does not need IDs.

### 3.2 Checkpoint statuses

Use only:

- active — phase is still being developed;
- approval_ready — all runtime-visible blockers are closed and the target exact revision is ready for a human approval boundary.

Planning checkpoints that do not require human approval remain active until the owning skill explicitly completes them and the runtime clears the checkpoint after structural validation.

No generic completed checkpoint is retained. Completion means the canonical target is safely persisted and the temporary checkpoint is removed.

### 3.3 Canonical document approvals

PRD, experience and engineering use one project-document approval contract:

```yaml
schema_version: 2
status: approved
approval:
  at: 2026-10-02T09:00:00Z
  revision: 64-hex-sha256
```

PRD additionally records experience: required or not_required for new vNext documents.

A project document is approved only when:

- status is approved;
- approval.at is valid;
- approval.revision equals the current normalized content revision.

The normalized revision excludes approval lifecycle metadata itself: status, approved_at compatibility metadata and approval. It includes all other frontmatter plus the document body.

Changing approved content therefore invalidates approval automatically even if a manual edit forgets to clear the approval block.

Work-item spec keeps its existing approval.at + approval.revision mechanism.

### 3.4 tasks.yaml

Keep task identity, dependencies and lifecycle. Remove the current global one-in-progress invariant.

Add optional mutation intent:

```yaml
- id: T003
  title: Add repository checkpoint persistence
  state: in_progress
  depends_on: []
  mutation:
    surfaces:
      - src/domain/workflow/
      - src/infrastructure/persistence/execution-state.mts
    resources:
      - workflow-state-schema
```

surfaces are normalized repository-relative files or directory prefixes, not arbitrary globs. resources are opaque stable tokens for shared mutable concerns that are not adequately represented by paths, such as schema ownership or a shared generated contract.

For the first/only active task, mutation claims may be absent. Starting a second concurrent mutating task requires complete claims for all concurrently active tasks.

### 3.5 review.yaml

Evolve to schema version 2:

```yaml
schema_version: 2
work_item: W004
disposition: changes_required

active_pass: null

worker_runs:
  - id: E001
    task: W004-T003
    runtime: codex
    runtime_version: 0.0
    surface: cli
    model: resolved-runtime-id
    effort: medium
    context_mode: fresh
    workspace_isolation: none
    usage:
      input_tokens: null
      output_tokens: null

passes:
  - id: R001
    scope:
      kind: work_item
      ref: W004
    inspected:
      - _flow/work-items/W004-*/spec.md
      - task:W004-T003
    parecer: >
      The state layer is recoverable, but approval cleanup can strand a stale checkpoint.
    disposition: changes_required
    findings:
      - id: F001
        blocking: true
        claim: Approval cleanup is not recoverable after interruption.
        evidence:
          - src/application/approval/commands/record.ts
        cause: worker_quality
    actions:
      - type: repair_task_created
        finding: F001
        task: W004-T004
    resolutions: []
    residual_risk: []
```

Later passes do not rewrite R001/F001. They append a resolution such as resolved, reopened, superseded or accepted_residual_risk.

Allowed pass dispositions are:

- approved
- changes_required
- blocked

Top-level disposition is the folded current result and may additionally be pending before any final pass. It is derived/validated from pass history rather than an independent source of truth.

worker_runs are compact execution evidence for review-derived model/handoff tuning. Unsupported usage fields remain null; Flow never invents usage/cost.

### 3.6 What checkpoint state does not retain

After exact approval/persistence:

- temporary PRD/experience/engineering/spec checkpoints are deleted;
- no parallel rendered draft is retained;
- no permanent product/engineering decision journal is added;
- approved product truth remains in PRD;
- approved experience truth remains in experience.md when relevant;
- approved technical truth remains in engineering.md;
- approved bounded work-item truth remains in spec.md;
- Git retains normal repository history.

Review history is the intentional exception because review/repair traceability is itself part of the work-item contract.

## 4. State ownership and SSOT

| Durable fact                                                 | Exact owner                                  | Kind                        |
| ------------------------------------------------------------ | -------------------------------------------- | --------------------------- |
| Product purpose/users/scope/requirements/non-goals           | _flow/docs/prd.md                            | canonical                   |
| Whether current scope needs experience definition            | PRD frontmatter                              | canonical                   |
| Consequential interaction/experience behavior when required  | _flow/docs/experience.md                     | canonical, optional         |
| Architecture/topology/ownership/dependency rules             | _flow/docs/engineering.md                    | canonical                   |
| Work-item outcome/scope/acceptance/local decisions           | work-item spec.md                            | canonical                   |
| Work-item dependency graph                                   | spec depends_on fields                       | canonical                   |
| Task decomposition/dependencies/lifecycle/mutation intent    | tasks.yaml                                   | canonical                   |
| Review passes/findings/repairs/resolutions/final disposition | review.yaml                                  | canonical                   |
| Current active delivery work item                            | _flow/state.yaml active.work_item            | canonical structural cursor |
| In-progress decision/planning frontier                       | _flow/state.yaml checkpoint                  | temporary                   |
| Implementation identity/evidence                             | Git commits/trailers                         | canonical evidence          |
| Gate definitions                                             | _flow/gates.yaml                             | canonical                   |
| Derived backlog/graph                                        | _flow/generated/*                            | generated/disposable        |
| Runtime capability profile                                   | orchestrator runtime context                 | derived/ephemeral           |
| Worker summaries                                             | worker response / review evidence references | derived, not SSOT           |

Rules preventing stale duplication:

- checkpoint references canonical artifacts by path/ID/revision instead of copying them;
- project approvals are revision-bound;
- route never treats generated projections as authority;
- review pass history is append-only;
- runtime capability/model names are detected per execution, not persisted as policy;
- completed worker output is evidence, not implementation truth.

## 5. Atomic persistence

### 5.1 Single-file writes

Generalize the temp-file + same-directory rename pattern already used by project projections into the canonical filesystem boundary.

All Flow-owned canonical/checkpoint YAML/Markdown writes use one atomicWriteText primitive. writeYaml delegates to it.

Before rename, the new content must parse/validate against its domain contract.

### 5.2 Multi-file creation

Work-item creation stages spec.md, tasks.yaml and review.yaml in a temporary sibling directory, validates the full shell, then renames the directory into its final W###-* path.

A partially created final work-item directory is therefore never a valid steady state.

### 5.3 Cross-file transitions

Do not add a general transaction engine or permanent journal.

Use ordered, idempotent transitions with detectable intermediate states:

**Approval + checkpoint cleanup**

1. verify checkpoint target revision and no unresolved required dimension;
2. atomically record exact approval in the canonical artifact;
3. validate approved artifact;
4. clear checkpoint atomically.

Crash after step 2 yields approved matching artifact + stale checkpoint. Doctor may auto-clear that checkpoint because the intended canonical result is unambiguous.

**Task commit + lifecycle**

Keep the existing temporary Git-index model. Add consistency validation so Doctor detects:

- completed task with missing/ambiguous canonical task commit;
- canonical task commit while local lifecycle remains stale.

Recovery never guesses when Git evidence is ambiguous.

**Review completion + Git evidence**

Keep review-complete's temporary-index/commit boundary, but Doctor verifies approved review disposition against canonical work-item review commit.

### 5.4 Partial-write detection

Doctor/validate detect:

- parse-invalid canonical file;
- recognized temp file/directory left by Flow;
- approved artifact with non-matching approval revision;
- active checkpoint whose input/target revision is stale;
- approved matching artifact plus stale checkpoint;
- task lifecycle/Git trace disagreement;
- review disposition/Git review evidence disagreement;
- invalid concurrent mutation claims.

Only unambiguous cleanup is automatic.

## 6. Routing and Doctor

### 6.1 Route precedence

routeProject follows this order:

1. pending migration reconciliation;
2. structural recovery conflict from shared validation;
3. active checkpoint;
4. PRD exact approval;
5. required experience exact approval;
6. engineering exact approval;
7. active work-item focus from state.active.work_item;
8. known-MVP backlog mapping if no work items exist;
9. next eligible outlined work-item specification;
10. exact spec approval;
11. task decomposition;
12. active task execution;
13. review/repair;
14. next eligible work item or finished.

The critical rule is:

> An active checkpoint overrides artifact-existence inference.

A valid-looking draft PRD, first work-item shell or first task therefore cannot accidentally advance the workflow.

### 6.2 Doctor validation

Quick Doctor remains lightweight but validates state/checkpoint parseability and canonical work-item structure.

Full Doctor/validate add:

- exact PRD/experience/engineering/spec approval integrity;
- checkpoint target/input revision coherence;
- no approval_ready checkpoint with unresolved dimensions;
- one active work-item focus;
- no concurrently active tasks across different work items;
- dependency-safe active tasks;
- safe declared mutation concurrency within the active work item;
- task lifecycle versus Git trace;
- review history validity and unresolved blocking findings;
- approved review versus canonical review commit;
- partial Flow temp artifacts/transitions;
- existing generated projection freshness checks.

### 6.3 Doctor repair policy

Doctor is conservative.

It may automatically repair only facts whose intended result is deterministic:

- regenerate disposable generated projections;
- remove recognized abandoned Flow temp files/directories;
- clear a stale checkpoint when its exact target revision is already approved and all cleanup preconditions match.

It must not automatically:

- choose between conflicting canonical documents;
- invent/resolve a product or engineering decision;
- change a task from pending/in_progress/completed when Git evidence is ambiguous;
- accept residual review risk;
- rewrite overlapping task mutation claims;
- select a branch/worktree after conflicting Git evidence.

Those cases route to reconciliation or human judgment.

## 7. Approval integrity

### 7.1 Shared project-document revision contract

Refactor src/domain/project/document.mts to parse frontmatter/body, serialize normalized metadata and compute contentRevision.

PRD, experience and engineering validators reuse this contract.

flow approval record expands from spec-only approval to these canonical targets:

- _flow/docs/prd.md
- _flow/docs/experience.md when present
- _flow/docs/engineering.md
- canonical work-item spec.md

No arbitrary file may be approved.

### 7.2 Invalidation

Any approved content change changes contentRevision immediately.

Route and every downstream mutating boundary uses isApprovedRevision, not status alone. A stale status: approved with a mismatched hash is invalid and must be repaired/reapproved.

### 7.3 Downstream guards

Direct CLI use cannot bypass route.

At minimum:

- work-item mapping requires current approved PRD, required experience and engineering;
- spec promotion/approval requires approved upstream project contracts;
- task creation/start/commit requires approved upstream contracts and exact approved spec;
- work-item review approval requires approved upstream contracts, exact spec and resolved blocking review findings.

Skills still determine whether a proposed change is material; runtime only enforces the recorded approval facts.

## 8. Work-item and task lifecycle

### 8.1 Active work item

state.active.work_item is set when a work item becomes the delivery focus, normally after spec approval and before task execution/decomposition on its work-item branch.

Only one work item may hold this active delivery focus.

Read-only analysis may inspect other work items, but mutating implementation/review work remains scoped to the active item unless the current item is safely completed/paused through an explicit transition.

### 8.2 Task states

Keep pending, in_progress and completed. Eligibility/blocking remains derived.

Multiple in_progress tasks are legal only inside state.active.work_item.

### 8.3 Safe concurrent mutation

Starting a second in_progress task requires all of:

- both tasks belong to the active work item;
- no dependency path requires one to precede the other;
- both tasks declare mutation.surfaces;
- declared surface prefixes do not overlap;
- declared resources do not intersect;
- the orchestrator has selected a workspace/isolation strategy supported by the runtime;
- no active checkpoint/contract change invalidates either task.

Runtime checks the structural facts. The orchestration skill separately considers architectural ownership, integration cost, verification coupling and whether concurrency is actually useful.

Isolation does not authorize overlapping ownership. Separate worktrees reduce filesystem collision risk; they do not make two writers to the same contract safe.

When concurrent tasks commit, task commit verifies actual files fall within the task's declared surfaces. If reality expands the change surface into another active task's claim/shared resource, commit is blocked until the orchestrator serializes/replans.

### 8.4 Task decomposition completion

The planning checkpoint is the only completion marker for incremental task decomposition. No separate finalized boolean is added to tasks.yaml.

This avoids duplicating lifecycle state while preventing non-empty tasks.yaml from masquerading as a completed plan.

## 9. Review model

### 9.1 Append-only passes

Finalized passes are immutable. A later pass may only append new findings/resolutions/actions.

Finding IDs are stable within the work item when later work needs to reference them.

### 9.2 Finding state

Current finding state is folded from history:

- open
- resolved
- reopened
- superseded
- accepted_residual_risk

blocking is a property of the finding at the pass that raised it. Runtime prevents final approval while a blocking finding folds to open or reopened.

Qualitative correctness, severity and whether residual risk is acceptable remain reviewer/orchestrator/human judgment.

### 9.3 Reviewer/orchestrator actions

Pass history records material actions only:

- verified or rejected a reviewer claim;
- created/reopened a repair task;
- linked repair evidence;
- resolved/reopened/superseded a finding;
- accepted residual risk;
- issued final disposition.

Routine tool narration is not persisted.

### 9.4 Tuning feedback

Each true finding may carry one cause:

- missing_context
- worker_quality
- integration_conflict
- scope_leak
- verification_gap
- orchestration_error

This attribution drives worker/model/handoff tuning.

Repeated missing_context findings change the handoff contract. Repeated worker_quality findings with sufficient context may raise model/effort. integration_conflict changes decomposition/isolation. scope_leak tightens ownership. verification_gap tightens expected evidence. orchestration_error changes delegation/parallelism decisions.

## 10. Runtime capability model

Flow does not branch orchestration policy on Claude/Codex names.

The orchestration skill builds an in-memory capability profile from the runtime it is currently executing in:

| Capability           | Meaning                                                          |
| -------------------- | ---------------------------------------------------------------- |
| spawnWorkers         | child workers can be launched                                    |
| workerModelOverride  | model can be selected for a worker                               |
| workerEffortOverride | reasoning effort can be selected                                 |
| contextModes         | fresh/full-parent/bounded modes actually exposed                 |
| workspaceIsolation   | none/session/per-worker isolation actually guaranteed            |
| concurrency          | runtime-reported/configured concurrent-worker ceiling when known |
| usageTelemetry       | token/cache/cost data actually exposed                           |
| runtimeVersion       | version/build for evidence                                       |
| surface              | CLI/app/IDE/non-interactive/etc.                                 |

nested delegation/resume may be observed, but vNext does not depend on them.

Capability fallback:

1. no worker spawning:
   - genuinely simple and bounded implementation may still be performed directly by the orchestrator;
   - ordinary orchestrator responsibilities such as user interaction, synthesis, integration judgment and review remain available;
   - non-simple implementation blocks or defers, surfaces the capability limitation, and requires a capable runtime or another explicit worker mechanism before implementation continues;
   - the orchestrator must not silently bypass mandatory delegation by implementing non-simple work itself;
2. no model override -> inherit runtime model;
3. no effort override -> inherit/default effort;
4. no context control -> send a self-sufficient minimum handoff and accept runtime-owned context behavior;
5. no safe workspace isolation -> do not run conflicting writers concurrently;
6. no usage telemetry -> tune from review outcomes/retries/output size instead.

The CLI does not implement a vendor-specific agent launcher in vNext. Runtime-native spawning remains a skill/orchestrator responsibility, and an explicit external worker mechanism may satisfy mandatory delegation when the active runtime itself cannot spawn workers.

## 11. Minimal worker contract

### 11.1 Minimum input

Every delegated responsibility contains only:

1. Objective — one observable outcome sentence.
2. Repository state — repository plus exact work-item branch/commit when relevant.
3. Ownership — task/work-item ID and owned change surface.
4. Read-first references — exact repository paths/headings/symbols needed.
5. Scope/non-goals — what may and may not change.
6. Relevant constraints — only constraints that can change the implementation.
7. Acceptance criteria — only criteria owned by this responsibility.
8. Verification — minimum expected checks/evidence.
9. Stop/escalate conditions — missing decision, scope expansion, contract contradiction, isolation failure or unverifiable result.
10. Output contract — compact fields below.

Repository references are preferred over copied PRD/engineering/spec text. Copy only the bounded slice a worker cannot otherwise access.

### 11.2 Minimum output

Workers return:

- status: completed | blocked | needs_escalation;
- delivered: terse changed behavior/conclusion and meaningful surface;
- verification: checks plus outcome;
- material decisions/deviations: none when none;
- blockers/residual risk;
- durable handoff reference: commit/branch/worktree/artifact/finding IDs when relevant.

Do not return the prompt, tool diary, whole diff, whole test log or repository recap.

## 12. Model routing

Use the cheapest historically capable model/effort for the bounded responsibility. Model identifiers are runtime-resolved, not hard-coded in Flow.

Failure handling is cause-specific:

| Failure cause        | Default response                                                                     |
| -------------------- | ------------------------------------------------------------------------------------ |
| missing_context      | add the missing reference/slice; do not raise model first                            |
| worker_quality       | retry/repair; raise effort or model after evidence of insufficiency                  |
| integration_conflict | serialize/repartition/change isolation; model escalation is not the fix              |
| scope_leak           | tighten ownership/non-goals; escalate only if discipline still fails                 |
| verification_gap     | strengthen expected evidence/checks                                                  |
| orchestration_error  | change delegation/decomposition/parallelism; keep worker model if otherwise adequate |

Escalate to user/orchestrator rather than a stronger worker when the missing input is a consequential product/experience/engineering decision.

Review history is the empirical source for routing changes. One unusual failure does not permanently change the baseline.

## 13. Git, branch, worktree and PR lifecycle

### 13.1 Branch boundary

One active work item maps to one work-item implementation branch.

The branch is created from the exact intended base after the work-item spec is approved and the item becomes the active delivery focus. Task decomposition and implementation may then evolve on that branch.

Project-wide contract changes discovered during work are updated/approved through their owning contract and integrated intentionally; implementation must not silently establish a second architecture on the branch.

### 13.2 Draft PR

Do not open an empty PR.

Open the draft PR after the first meaningful publishable implementation/checkpoint exists on the work-item branch—normally the first completed task commit, or an earlier substantial checkpoint when it is genuinely useful for review.

### 13.3 Worker isolation

One work-item branch remains the integration authority.

Optional worker worktrees/temporary branches are execution mechanisms only. Use them when runtime support and collision risk justify isolation. They must start from the exact active work-item state.

The orchestrator owns integration/cherry-pick/merge decisions and verifies the integrated branch, not merely worker-local results.

### 13.4 Cleanup

After integration/final disposition:

- remove temporary worker worktrees/branches that Flow created;
- ensure no active task points at discarded work;
- clear state.active.work_item;
- retain canonical Git commits and work-item review history.

## 14. Runtime responsibility versus skill judgment

| Concern                                                    | Deterministic runtime       | Skill/model judgment                              |
| ---------------------------------------------------------- | --------------------------- | ------------------------------------------------- |
| Checkpoint schema and atomic persistence                   | yes                         | decide meaningful content                         |
| Relevant discovery/engineering dimensions                  | no                          | yes                                               |
| Block forward progress with unresolved recorded dimensions | yes                         | decide relevance/consequence                      |
| Question batching/recommendation/challenge                 | no                          | yes                                               |
| Exact revision approval                                    | yes                         | ask/interpret human approval                      |
| Experience relevance                                       | persist/route result        | decide/recommend                                  |
| Work-item/task structural lifecycle                        | yes                         | choose decomposition                              |
| One active work item                                       | yes                         | choose next outcome                               |
| Concurrent mutation dependency/surface/resource safety     | yes                         | decide whether parallelism is worthwhile          |
| Worker count/model/effort/context mode                     | capability facts only       | yes, evidence-driven                              |
| Git trace consistency                                      | yes                         | interpret ambiguous recovery with human if needed |
| Review history shape/finding closure                       | yes                         | findings, severity, parecer, residual risk        |
| Draft cleanup after approval                               | yes                         | no                                                |
| Generated projections                                      | yes                         | no                                                |
| Architecture/product decisions                             | no                          | yes                                               |
| Fresh-chat rehydration                                     | provide authoritative state | summarize and continue                            |

## 15. Exact implementation surfaces

### 15.1 Reuse largely unchanged

Keep and extend rather than replace:

- src/domain/work-item/specification.mts exact spec revision approval;
- src/infrastructure/persistence/work-items.mts canonical work-item folder loading;
- src/domain/work-item/lifecycle.ts derived lifecycle;
- src/application/task/commands/commit.ts temporary-index Git evidence model;
- src/application/trace/operations/trace.mts permanent W###/T### evidence discovery;
- src/infrastructure/projections/project.mts disposable projections;
- _flow/gates.yaml and gate evaluation;
- work-item folder shape spec.md + tasks.yaml + review.yaml.

### 15.2 Rewrite/evolve

- src/domain/workflow/execution-state.mts
  - schema v3;
  - remove scalar active.task;
  - make active.work_item real;
  - add checkpoint model.
- src/domain/workflow/workflow.ts
  - add experience and explicit checkpointable planning/specification steps without turning it into a transition engine.
- src/domain/project/document.mts
  - parsed document model, normalized revision, shared exact-approval helpers.
- src/domain/project/product-requirements-document.mts
  - vNext approval and experience relevance validation.
- src/domain/project/engineering-document.mts
  - exact approval validation.
- src/application/approval/commands/record.ts
  - support canonical project docs and specs.
- src/application/route/operations/route.mts
  - checkpoint precedence, experience route, active work-item focus, recovery guards, multiple active tasks.
- src/application/doctor/operations/doctor.mts and src/application/project-validation.mts
  - shared recovery consistency checks.
- src/domain/task/task.ts and src/domain/task/task-list.mts
  - remove one-in-progress invariant;
  - add mutation claims;
  - preserve dependency DAG.
- src/application/task/commands/start.ts
  - central upstream approval guard;
  - active work-item guard;
  - concurrent mutation authorization.
- src/application/task/commands/commit.ts
  - validate files against declared surface when concurrency requires it.
- src/domain/work-item/review.mts and src/domain/work-item/work-item.ts
  - schema v2 review history/disposition/worker evidence.
- src/application/work-item/commands/review-complete.ts
  - approve only folded clean review state and matching evidence.
- src/application/work-item/commands/create.ts
  - stage/validate/rename the shell directory atomically.
- src/infrastructure/filesystem/files.ts and serialization/yaml.ts
  - canonical atomic-write primitive.

### 15.3 New runtime/domain modules actually required

- src/domain/workflow/checkpoint.mts
  - checkpoint types, parse/validate, unresolved/frontier rules.
- src/infrastructure/persistence/execution-state.mts
  - load/write state.yaml atomically.
- src/domain/work-item/concurrency.mts
  - task dependency plus surface/resource conflict rules.
- src/domain/project/experience-document.mts
  - optional experience contract validation.
- one checkpoint application slice under src/application/checkpoint/
  - small public persistence boundary for begin/update/clear/complete checkpoint operations; skills must not hand-edit state.yaml.
- one work-item review persistence operation/subcommand in the existing work-item slice
  - atomic active-pass checkpoint/finalize append; no separate review root/tree is required.

No generic transaction framework, event store, runtime-vendor adapter or permanent decision-log subsystem is required.

### 15.4 Skills to add/update

Add:

- skills/flow/core/orchestration.md
- skills/flow/experience/step-01-define.md
- skills/flow/experience/step-02-await-approval.md

Update:

- skills/flow/SKILL.md
- skills/flow/invariants.md
- skills/flow/core/continuation.md
- skills/flow/core/recovery.md
- skills/flow/core/decisions.md
- skills/flow/discovery/step-01-project.md
- skills/flow/discovery/step-02-await-approval.md
- skills/flow/engineering/step-02-synthesize.md
- skills/flow/engineering/step-05-present.md
- skills/flow/planning/step-01-plan-work-item.md
- skills/flow/specification/step-01-deepen-spec.md
- skills/flow/specification/step-02-await-approval.md
- skills/flow/planning/step-01-create-tasks.md
- skills/flow/build/step-01-execute-task.md
- skills/flow/review/step-01-review-work-item.md
- skills/flow/reconcile/step-01-reconcile.md

Delete/rewrite stale language that says backlog.yaml is canonical, state.yaml already contains a maintained cursor, or only one mutating task may exist globally.

## 16. Migration and backward compatibility

Keep migration proportional.

### 16.1 state.yaml

Read schema v2 and v3 during migration. Convert migration.status exactly.

Do not pretend old execution.phase/step fields are trustworthy if they were never maintained. Reconstruct only facts that can be proven:

- active work item from current canonical task/review state when unambiguous;
- no active checkpoint unless an existing draft requires a recovered checkpoint.

Recovered checkpoints may adopt facts present in a draft artifact but must not invent historical rationale.

### 16.2 Existing approved PRD/engineering

For an existing status: approved document with valid approved_at, migration may bind the current exact bytes to a new approval.revision and preserve the timestamp. This does not create a new human decision; it makes the already-recorded approval exact.

Legacy PRDs may omit experience. For compatibility, route treats absent experience metadata as legacy not-required for existing scope. The next substantive PRD update under vNext must record required or not_required explicitly.

### 16.3 Existing work items

Do not rewrite completed history merely to fit new schemas.

Parsers may read legacy tasks/review schemas. Active/future work items are upgraded when touched.

For legacy approved review.yaml, preserve the existing approval and canonical review commit. Do not fabricate findings or a detailed parecer that never existed.

### 16.4 Generated state

Regenerate _flow/generated projections from canonical work items. Never migrate generated files as authority.

## 17. Verification strategy

PR #51 is the evaluation source. Its numerical targets remain calibration thresholds, not hard-coded runtime policy.

### 17.1 Deterministic tests required

Before vNext is complete, add high-signal unit/integration coverage for:

- checkpoint parse/write/clear and atomic replacement;
- route prefers active checkpoint over valid-looking partial artifact;
- unresolved checkpoint cannot become approval_ready;
- exact project-document approval survives no edit and invalidates on any approved-content edit;
- required experience routing;
- interrupted work-item shell creation does not expose a partial canonical item;
- interrupted backlog mapping/task decomposition resumes the owning planning checkpoint;
- one active work item guard;
- two independent same-work-item tasks with non-overlapping claims are valid;
- dependent/overlapping/shared-resource tasks cannot be concurrently active;
- task commit cannot escape a concurrent mutation claim;
- review pass append-only behavior and finding folding;
- approved review blocked by unresolved blocking finding;
- task/review lifecycle versus Git trace inconsistencies are detected;
- approved target + stale checkpoint is safely repairable;
- consequential stale/conflicting state routes to reconciliation instead of mutation.

### 17.2 Benchmark mapping

Smallest release-candidate benchmark core:

- B01 — discovery unresolved-dimension preservation;
- B02 — fresh-chat discovery resume;
- B05 — parallel versus sequential writer selection;
- B06 — relevant-constraint minimum handoff;
- B07 — seeded-defect review;
- B08 — truthful repair closure;
- B11 — token-efficient handoffs;
- B12 — stale/inconsistent-state recovery.

Then run:

- B03 for experience/engineering resume;
- B04 for proportional delegation;
- B09 for review-history quality;
- B10 for evidence-driven model escalation.

Deterministic tests prove structural invariants. Human/rubric benchmarks prove judgment quality. Neither substitutes for the other.

## 18. Implementation decomposition

These are observable delivery work items, not planning phases or architecture layers. Infrastructure/runtime plumbing is implemented as tasks inside the first outcome that requires it.

### W1 — Decision-heavy work can stop and resume safely from repository state

**Delivers:** resumable discovery/planning behavior. Enabling tasks introduce state.yaml v3, atomic canonical writes, checkpoint persistence/cleanup and atomic work-item shell creation.

**Depends on:** none.

**Observable acceptance:** interrupting decision-heavy discovery or planning leaves enough canonical repository state for a fresh chat to resume the same decision frontier; an interrupted work-item creation never exposes a partial shell as canonical; approved/persisted outcomes clear their temporary checkpoint safely.

### W2 — Approved project contracts remain trustworthy and experience routes correctly

**Delivers:** shared project-document revision approval, PRD experience relevance, optional experience.md and exact approval guards.

**Depends on:** W1.

**Observable acceptance:** editing approved PRD/experience/engineering content invalidates downstream authorization; experience routes only when required by the approved PRD.

### W3 — Fresh chats recover the correct next safe action

**Delivers:** checkpoint-first routing, shared recovery consistency checks, stale-cleanup repair and planning/specification resume guards across route, validate and Doctor.

**Depends on:** W1, W2.

**Observable acceptance:** a fresh chat, Doctor and normal routing reconstruct the same safe continuation from repository/Git state; partial decision/planning work resumes at the correct frontier and consequential inconsistencies stop before mutation.

### W4 — One active work item can execute independent tasks safely in parallel

**Delivers:** real active work-item focus, multiple in_progress tasks, mutation claims, conflict prevention and commit-surface verification.

**Depends on:** W1, W3.

**Observable acceptance:** independent same-work-item tasks can execute concurrently; dependent, overlapping or shared-resource writers cannot.

### W5 — Review and repair history survives interruption and remains traceable

**Delivers:** review.yaml v2, active review checkpoint, append-only passes/findings/resolutions, worker evidence and clean final-disposition guards.

**Depends on:** W1, W3.

**Observable acceptance:** interrupted review resumes from durable state, repairs do not erase prior findings, later passes can trace resolutions to repair evidence, and unresolved blocking findings prevent approval.

### W6 — Non-simple execution delegates efficiently using runtime capabilities and minimum-sufficient context

**Delivers:** orchestration skill, minimum worker contract, capability detection and mandatory-delegation gate, cheapest-capable routing, failure-cause escalation and branch/worktree guidance.

**Depends on:** W3, W4, W5.

**Observable acceptance:** non-simple implementation delegates through an available worker mechanism; if none is available it blocks/defers with the capability limitation surfaced instead of falling back to direct implementation. Genuinely simple bounded changes and ordinary orchestrator responsibilities still proceed without workers. Worker handoffs remain bounded, safe parallelism is chosen dynamically, and unsupported optional runtime features degrade safely.

### W7 — Existing projects can adopt vNext and traverse the complete lifecycle safely

**Delivers:** discovery/experience/engineering/planning/spec/build/review/reconcile skills aligned with the new runtime; schema compatibility/adoption for existing projects.

**Depends on:** W2, W3, W4, W5, W6.

**Observable acceptance:** an existing project adopts vNext without loss of canonical state and can resume correctly; a new or migrated project can traverse the complete vNext lifecycle without stale guidance or bypassing required checkpoints/delegation.

### W8 — vNext behavior can be regression and benchmark tested

**Delivers:** deterministic interruption/conflict fixtures plus the PR #51 high-signal benchmark harness/results format.

**Depends on:** W3, W4, W5, W6, W7.

**Observable acceptance:** the mandatory structural tests pass and the initial B01/B02/B05/B06/B07/B08/B11/B12 evaluation cycle can be executed repeatably.

## 19. Rejected or narrowed research recommendations

### Permanent append-only product/engineering decision journal — rejected

PR #49 recommends retaining a compact durable decision history after rendered draft deletion.

vNext does not add that artifact. The settled Flow rule is that temporary decision drafts/checkpoints are removed after the canonical approved state is safely persisted, and the smallest sufficient recovery model does not require another long-lived process-memory SSOT.

During an active phase, the checkpoint retains the compact decisions/rationale needed to resume. After approval, the approved contract is authoritative and normal Git history remains available for change provenance. Review history remains permanent because review/repair traceability is itself an explicit work-item requirement.

This can be revisited only if real Update/recovery failures show that canonical contracts + Git history are insufficient.

### General transaction/journal subsystem — rejected

PR #48 reasonably suggested staging directories or a transaction/journal marker for multi-file transitions.

The design adopts staging-directory rename for work-item creation, but rejects a general journal. Atomic single-file replacement plus ordered idempotent cross-file transitions and Doctor reconciliation covers the identified failure modes with less surface area.

### Global single-mutating-task invariant — rejected and corrected

The stale current invariant found by PR #48 is not carried forward.

The accepted model is one active work item plus safe independent intra-work-item tasks. Runtime prevents dependency/change-surface/shared-resource conflicts; it does not prohibit intentional safe concurrency.

### Vendor-specific worker/model tables — rejected

PR #50's capability evidence is adopted, but Flow does not persist Claude/Codex model names, fixed concurrency values or assume per-worker worktrees. Runtime capability is detected from the active environment and unknowns degrade safely.

### Separate UX spines, review trees and rendered validation reports — rejected

BMAD mechanisms are adapted without importing mandatory DESIGN.md + EXPERIENCE.md pairs, HTML reports, per-lens review files or a new review directory. Flow keeps one optional minimum-useful experience contract and review history inside the work item.

### Evaluation thresholds as runtime rules — rejected

PR #51 thresholds remain benchmark calibration targets. They are not encoded into routing or domain policy.

## 20. Final invariants

Flow vNext is complete only when these statements are true:

- a fresh chat can recover every consequential in-progress decision from repository/Git state;
- no relevant unresolved decision can be silently skipped by artifact-existence routing;
- temporary checkpoints disappear after exact canonical approval without leaving a second authority;
- PRD, required experience, engineering and specs cannot be used downstream after approved content changes;
- one active work item is the normal delivery boundary;
- independent tasks inside it may run concurrently when deterministic conflict guards pass and the orchestrator judges parallelism worthwhile;
- unsafe/conflicting mutations are blocked;
- non-simple implementation is delegated through a worker mechanism; when none is available, implementation blocks/defers rather than falling back to direct orchestrator implementation;
- worker context is minimum-sufficient and model/effort escalation is evidence-driven;
- review history is durable, append-only and sufficient to understand findings, repairs, resolutions and residual risk;
- deterministic runtime remains limited to structural integrity;
- skills remain responsible for product, experience, architecture, orchestration and review judgment;
- no current chat context is required for continuity.
