---
name: flow
description: Autonomous, readability-first software delivery workflow. Continue from project state or incorporate new intent, ask only for consequential decisions, then plan, build, validate, reconcile, and continue as far as safely possible.
---

# Flow

## Public contract

`/flow` is the only public workflow skill.

- `/flow` with no additional intent continues from `.flow/STATE.md` as far as safely possible.
- `/flow <freeform intent>` incorporates the intent into current project context and continues appropriately.
- If `.flow/STATE.md` does not exist, begin global discovery using the idea, repository, or source documents supplied.

Do not require the developer to know or invoke internal workflow phases.

## Core principles

1. **Readability first.** Canonical artifacts must be understandable without Flow internals.
2. **Decision ownership.** The developer owns consequential product and engineering decisions; the agent executes within approved rules and obvious conventions.
3. **Autonomy by default.** Continue until a consequential decision requiring developer input, external approval, unrecoverable blocker, or no-ready-work condition.
4. **Just-in-time detail.** Resolve global decisions during discovery and work-item detail only when that item becomes active.
5. **Production-aware MVP.** MVP includes product capability plus the technical, infrastructure, quality, deployment, and operational work needed to run it.
6. **Parallelism first.** Execute the largest safe independent set while preserving correctness and token efficiency.
7. **Automatic synchronization.** Keep state, decisions, PRD, engineering definition, backlog, graph, specs, and tasks aligned.
8. **Artifact restraint.** Never create a new project document or artifact unless the developer explicitly requests or authorizes it. Update existing approved artifacts instead whenever possible.
9. **Execution continuity.** Do not pause execution merely to report progress, completion, or next steps. Continue automatically while ready work exists. Surface status only when execution has actually stopped or when developer input is required.

## Canonical project artifacts

Create artifacts only when they become valid and only when the developer has explicitly requested or authorized their creation. `flow init` creates only `.flow/config.yaml`.

Developer-facing knowledge is Markdown:

- `.flow/PRD.md` - current global product truth and MVP boundary.
- `.flow/ENGINEERING.md` - global engineering truth.
- `.flow/DECISIONS.md` - consequential decision record and rationale.
- `.flow/STATE.md` - concise current execution/navigation checkpoint and resume context.
- `.flow/GRAPH.md` - human-readable derived projection of the work-item dependency graph and current readiness state.
- `.flow/work-items/<folder>/SPEC.md` - readable lifecycle/specification of one work item.

Graph/control data is YAML:

- `.flow/BACKLOG.yaml` - canonical work-item DAG and work-item state.
- `.flow/work-items/<folder>/TASKS.yaml` - task DAG and execution ownership.

Do not create `SUMMARY.md`, completion logs, ad-hoc progress documents, handoff documents, reports, or any other new project artifact unless the developer explicitly requests or authorizes them. Completed `SPEC.md` files retain concise Overview and Validation sections.

`GRAPH.md` is derived only. It must never become an independent source of truth and must be reconciled whenever work-item existence, dependencies, or status change. Preserve its established visual style and conventions while updating it.

## Work item model

- `feature` (`F`) - product/user capability.
- `technical` (`T`) - architecture, infrastructure, platform, quality, deployment, or enabling work.
- `maintenance` (`M`) - reconciliation, migration, refactor, or corrective work.

Folder format is `<three-digit-sequence><kind-code>-<slug>` (for example, `001F-user-profile`). The sequence is a stable readability aid, never execution order. Dependencies determine readiness.

Work-item states are derived consistently:

- `complete` (`✅`, green) - the item is completed.
- `in_progress` (`🔵`, blue) - the item has active execution.
- `blocked` (`🔴`, red) - the item is neither complete nor in progress and at least one work-item dependency is not complete.
- `pending` (`🟡`, yellow) - the item is neither complete nor in progress and every work-item dependency is complete; it is ready to execute.

The graph must use these meanings consistently for nodes and outgoing dependency-line styling.

## Decision authority

Apply low-impact and conventional choices automatically. A decision requires developer approval when materially different choices affect product behavior or scope; architecture/public contracts; production infrastructure or cost; persistent data; security/privacy; testing strategy or gates; project-wide conventions; or other work-item assumptions.

## Decision presentation protocol

Every requested decision must use this readable structure:

### Decision

What needs to be chosen.

### Problem

The concrete uncertainty.

### Context

Relevant product, engineering, production, and existing-decision context.

### Options

Realistic alternatives and trade-offs.

### Recommended option

Exactly one recommendation when evidence permits.

### Why recommended

Concise justification grounded in current goals and constraints.

### Approach

The high-level direction following the recommendation.

### Impact

Affected definitions, rules, gates, work items, tasks, or implementation.

Never hide a consequential choice inside an implementation plan. Batch the largest currently-known set of independent decisions; do not invent hypothetical questions.

## Decision lifecycle and impact

Decision states are `candidate`, `pending_user`, `accepted`, `rejected`, and `superseded`. Preserve the rationale in `DECISIONS.md`. Reconcile pending work before execution, stop only affected in-progress paths, and create maintenance work rather than rewriting completed history.

## Internal workflow routing

Load only the reference needed for current state:

- Missing state or global definition: `references/discovery.md`
- Ready/unplanned work: `references/planning.md`
- Ready planned tasks: `references/build.md`
- Completed implementation awaiting validation: `references/review.md`
- Decision impact or inconsistent artifacts: `references/reconcile.md`

## Orchestration loop

1. Read `.flow/config.yaml`.
2. Read only the minimum navigation context from `.flow/STATE.md` when present.
3. Classify new intent and its impact on canonical truth, backlog, active work, or execution detail.
4. Respect work/tasks already `in_progress` under another execution ID.
5. Route to the minimal internal reference.
6. Claim selected work before parallel execution.
7. Continue planning, build, gates, review, fixes/reconciliation, and completion without another invocation.
8. Recompute work-item states and readiness after every meaningful transition, synchronize `BACKLOG.yaml`, `STATE.md`, and `GRAPH.md`, and continue if ready work exists.
9. Do not stop or return control merely to announce that a task/work item completed or to describe the next step. Stop only when developer input is required for a consequential decision, an external approval is required, an unrecoverable blocker prevents useful progress, or no ready work remains.

When execution stops, report the stopping reason and the smallest relevant status summary. During uninterrupted execution, avoid progress-only messages.

## Parallelism and gates

`auto` means the largest safe concurrency the orchestrator can reliably coordinate, considering dependencies, shared decisions/files/contracts, integration risk, available capacity, context complexity, and token overhead. It is not unlimited. Prefer one primary orchestrator and delegate only where independent substantial work justifies it.

Gates may be deterministic commands or agentic policy checks. Define/refine them during discovery or planning when relevant. Build agents know applicable gates before implementation; review validates requirements, integration, and blocking gates.

## Git and token efficiency

Follow the approved Git strategy in `ENGINEERING.md`; by default create one atomic commit per completed task. Read the minimum relevant canonical context, avoid repeated large-document ingestion and duplicate prose, reuse accepted decisions, prefer deterministic checks, and delegate only with narrow ownership/context packets.
