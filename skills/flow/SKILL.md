---
name: flow
description: Autonomous, readability-first software delivery workflow. Use /flow to bootstrap or continue a project from repository state, establish engineering rules before implementation, and continue through planning, build, review, reconciliation, and completion until a real stop condition exists.
---

# Flow

`/flow` is the only public workflow command. The repository is the source of truth; chat history is never required to resume.

## Intent intake

Before the first route of an invocation, incorporate any new freeform developer intent into canonical project state. If the repository is stopped on a consequential decision and the developer message resolves it, update the active spec and any affected authoritative artifacts, clear `state.yaml` `stop_reason`, and continue routing. If new intent changes existing scope or completed truth, route it through reconciliation rather than discarding it. Repository-driven routing never means ignoring the current developer message.

## Execution loop

1. Read `.flow/config.yaml`.
2. Run `flow route --path . --json`.
3. If `action=continue`, load **only** the returned instruction file from this skill and execute it completely.
4. Persist the step's required state/artifact changes.
5. Run the validations required by that step.
6. Return to step 2 without yielding control merely to report status.
7. Return control to the developer only when `flow route` returns `action=stop`.

Read `invariants.md` before the first routed step of a run. Do not preload future steps.

## Artifact authority

Flow invocation authorizes creation and update of canonical Flow artifacts. Noncanonical reports, handoffs, summaries, scratch documents, and extra project artifacts still require an explicit need.

Canonical project layout:

```text
.flow/
├── config.yaml
├── backlog.yaml
├── state.yaml
├── gates.yaml
├── docs/
│   ├── prd.md
│   ├── engineering.md
│   └── graph.md
└── work-items/
    └── w015-example/
        ├── spec.md
        ├── tasks.yaml
        └── artifacts/     # optional durable work-item outputs only
```

`docs/graph.md` is derived only. Regenerate it with `flow graph --path .` after backlog changes.

## Work-item model

- IDs are `W001`, `W002`, ...; the number is creation sequence only.
- Kind is data: `feature`, `technical`, or `maintenance`; it is not encoded in the ID.
- Folder format is `w###-kebab-case`.
- Persisted lifecycle state is exactly `pending`, `in_progress`, or `completed`.
- Human execution status is derived: pending + blockers => Blocked; pending + no blockers => Ready; otherwise In Progress/Completed.
- Work-item dependencies are represented only in `depends_on`. If W017 requires W003 and W015, both must be dependency edges and both must appear in the graph.

## Task/Git model

- Task IDs are local `T001`, `T002`, ...; externally qualify them as `W015-T003`.
- A completed code-changing task has exactly one reachable primary implementation commit with trailers:

```text
Flow-Work-Item: W015
Flow-Task: W015-T003
```

- SHA is derived with `flow trace`; never persist it in `tasks.yaml`.
- Do not squash Flow task commits when task-level traceability must survive.
- Completed work is immutable history: review fixes become new tasks; completed work-item changes become maintenance work.
- One shared worktree may have at most one mutating Flow task. Mutating parallelism requires isolated Git worktrees. Read-only analysis/review may run concurrently.
- Worker agents must not mutate shared control-plane files (`backlog.yaml`, `state.yaml`, `docs/graph.md`); the orchestrator owns them.

## Engineering bootstrap

No application implementation may begin until `.flow/docs/engineering.md` is approved and `.flow/gates.yaml` is valid.

The engineering bootstrap must recommend a complete architecture rather than expecting an inexperienced developer to design one. Inspect technology and constraints, apply the configured profile and brownfield policy, resolve every required architecture dimension, choose technology-appropriate conventions, design enforcement, review the recommendation, then present the complete proposal for developer argument/approval.

Flow has a permanent simplicity bias: implement architecture only while its present or credible near-term value exceeds its ongoing complexity. Reject speculative abstraction.

## Decisions

Consequential decisions live in the active work item's `spec.md` under `## Decisions` or `## Open Decisions`. Do not create a global decision log. When a work-item decision establishes global product or engineering truth, distill the accepted result into `docs/prd.md` or `docs/engineering.md` while retaining rationale in the originating spec.

## Gates

Prefer deterministic enforcement whenever possible. A blocking engineering rule must map to a command, builtin, or versioned agentic gate. Agentic gates are for judgment that static tooling cannot reliably decide. The baseline maintainability policy prioritizes readability, cohesion, appropriate SOLID use, YAGNI, proportional complexity, and no speculative abstractions.
