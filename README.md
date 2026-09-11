# Flow

Flow is a readability-first, agent-agnostic software delivery workflow for coding agents. It keeps software decisions with the agent/developer while moving workflow legality, state transitions, traceability, synchronization, and enforceable quality rules into deterministic code.

## Install

```bash
npm install --save-dev @caiqueoak/flow
npx flow init
```

`flow init` configures project-local runtime integrations and asks for an engineering baseline. It does **not** create the project backlog, PRD, engineering contract, or work items; `/flow` creates canonical artifacts as they become valid.

Built-in engineering profiles:

- **Pragmatic** — recommended; production-minded quality with a strong simplicity bias.
- **Strict** — stronger boundaries and verification for large/long-lived systems.
- **Prototype** — minimal structure while retaining baseline safety.

Existing repositories can use **Rebaseline** (recommended for AI/vibe-coded projects: existing code is evidence, not a standard) or **Preserve** (consistent existing patterns are candidates to retain).

## One public workflow

```text
/flow
```

A fresh chat can resume from repository state. `/flow` repeatedly asks the deterministic router what step is legal, loads only that micro-step, executes it, validates, persists the transition, and continues until a real stop condition exists.

Valid terminal reasons are consequential developer input, an external action, an unrecoverable blocker, or finished work. Task/work-item completion and progress reporting are not stop conditions.

## Canonical project model

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
    └── w015-learner-web-application/
        ├── spec.md
        ├── tasks.yaml
        └── artifacts/          # optional durable outputs only
```

Each fact has one owner:

- package metadata: installed Flow version
- `config.yaml`: runtime/bootstrap configuration
- `docs/prd.md`: global product truth
- `docs/engineering.md`: approved engineering contract
- `gates.yaml`: enforcement contract
- `backlog.yaml`: work-item existence, dependency DAG, priority and lifecycle
- `spec.md`: one work item's intent, decisions, implementation outcome and validation
- `tasks.yaml`: task DAG and lifecycle
- Git trailers: task → implementation commit identity
- `state.yaml`: current execution cursor/stop reason
- `docs/graph.md`: derived human projection only

`SUMMARY.md` and a global `DECISIONS.md` are not part of the model.

## Work items and execution status

Work-item IDs are `W001`, `W002`, ...; the number is **creation sequence only**. Kind is separate metadata (`feature`, `technical`, `maintenance`). Folder names use lowercase `w###-kebab-case`.

Persisted lifecycle is intentionally small:

```text
pending | in_progress | completed
```

Flow derives the human/execution view:

- **Ready** — pending and all dependencies/external blockers are satisfied.
- **Blocked** — pending with an incomplete dependency or explicit external blocker.
- **In Progress** — lifecycle is `in_progress`.
- **Completed** — lifecycle is `completed`.

Dependencies remain explicit DAG edges. If W017 depends on W003 and W015, `graph.md` renders both arrows. The same readiness function powers graph, status and routing so they cannot disagree.

## Engineering bootstrap before implementation

If no approved engineering contract exists, `/flow` enters engineering bootstrap before application code is written.

Flow inspects the technology and constraints, applies the selected profile/brownfield policy, and recommends a complete architecture rather than asking inexperienced developers to design one from scratch. The recommendation must explicitly resolve system shape, module boundaries, code organization, data/state ownership, external boundaries, conventions/naming, engineering principles, quality strategy, operations, and enforcement.

Flow has a permanent simplicity bias: choose the least complex design that satisfies current requirements and credible near-term growth. Speculative abstractions are rejected.

After deterministic breadth/proportionality checks and independent review, Flow presents the recommendation for developer approval. Approved rules receive stable `ENG-*` IDs and blocking rules must map to real enforcement.

## Gates

Flow prefers mechanical enforcement:

1. framework integrity (`flow validate`, DAG/state/traceability invariants),
2. deterministic project gates (tests, lint, typecheck, format, naming, dependency rules),
3. versioned agentic gates only for judgment such as readability, cohesion, appropriate SOLID use and unnecessary complexity.

The project engineering contract says **what/why**; `gates.yaml` says **how it is proven**.

## Git traceability and parallelism

A completed code-changing task has one primary implementation commit with structured trailers:

```text
feat: connect submissions to Worker API

Flow-Work-Item: W015
Flow-Task: W015-T003
```

The task ID is stable identity. The SHA is derived from reachable Git history:

```bash
flow trace W015-T003
```

Rebase/cherry-pick may change SHA without breaking traceability. Do not squash Flow task commits when task-level traceability must survive.

One shared worktree may contain at most one mutating Flow task. Parallel code-writing requires isolated Git worktrees; otherwise Flow serializes mutation. Read-only analysis/review may still run in parallel.

## CLI

```text
flow init
flow update
flow migrate
flow validate
flow route --json
flow status
flow gates
flow graph
flow trace W015-T003
flow --version
```

`flow validate --pre-commit W015-T003` checks task completion postconditions before the primary task commit exists; normal `flow validate` then verifies the reachable trailer.

`flow migrate` performs deterministic 0.4-style path/state normalization and reports legacy decision/summary artifacts that still require semantic reconciliation.

## Releases

Merges to `main` are released automatically after the test matrix passes. Conventional Commit PR titles drive semantic-release (`feat:` minor, `fix:` patch). The installed package metadata is the Flow version source of truth; project config does not duplicate it.
