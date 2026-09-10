# Flow

Flow is a readability-first, agent-agnostic software-development workflow for coding agents. It maximizes autonomous delivery while keeping consequential product and engineering decisions explicit and approved.

## Workflow

```text
idea / existing project
        ↓
global discovery
(product + engineering + production constraints)
        ↓
independent consequential decisions, batched for approval
        ↓
production-capable MVP
        ↓
work DAG (feature + technical + maintenance)
        ↓
/flow-next
        ↓
plan → build → gates → review → fixes → done
        ↓
next safe work item automatically
```

The agent continues until it reaches a consequential decision, external approval, unrecoverable blocker, or no ready work. Every requested decision must include **Decision, Context, Options, Recommended option, Why recommended, and Impact**.

## Project state

```text
.flow/
├── config.yaml
├── PRD.md
├── ENGINEERING.md
├── SUMMARY.md
├── DECISIONS.yaml
├── BACKLOG.yaml
├── STATE.yaml
├── gates/
└── work-items/
    ├── 001F-user-profile/
    │   ├── SPEC.md
    │   └── TASKS.yaml
    ├── 002T-production-baseline/
    │   ├── SPEC.md
    │   └── TASKS.yaml
    └── 003M-auth-reconciliation/
        ├── SPEC.md
        └── TASKS.yaml
```

`F`, `T`, and `M` mean **feature**, **technical**, and **maintenance**. The numeric prefix is a stable readable sequence, not execution order. Dependencies determine execution. `work-items` is intentionally generic enough to cover all three kinds while remaining explicit to readers.

## CLI

The CLI is intentionally small:

```bash
flow init
flow install
flow update
```

### Requirements

Flow requires Node.js 18 or newer.

- `flow init` creates `.flow/`.
- `flow install` installs the bundled skills into a coding-agent skill directory.
- `flow update` fetches the latest published Flow package and replaces the installed Flow skills.

The CLI does **not** plan work, schedule tasks, invoke models, or orchestrate subagents. Those responsibilities stay in the skills and coding-agent runtime.

Use an explicit skill directory when needed:

```bash
flow install --target .agents/skills
flow update --target .agents/skills
```

Then start a project in the coding agent:

```text
/flow-new "I want to build a diet app"
```

Normal operation after discovery is primarily:

```text
/flow-next
```

## Parallelism

```yaml
parallelism:
  strategy: maximum_safe
  max_concurrent_work_items: auto
  max_concurrent_tasks_per_work_item: auto
  delegation: allowed
```

`auto` means the orchestrating agent chooses the largest set it can safely coordinate for the current scheduling cycle. It considers real dependencies, decision dependencies, likely write/contract overlap, uncertainty, runtime/tool capacity, merge risk, and **token/coordination overhead**. It must prefer fewer workers when additional concurrency would waste tokens or lower confidence.

Before work starts, selected work items/tasks are marked `in_progress` with an execution ID. Another chat or agent must respect those claims and choose other ready work. Flow has no automatic claim timeout and never silently steals in-progress work.

## Token efficiency

Token efficiency is a framework constraint, not an afterthought. Skills must use the smallest sufficient context, avoid repeatedly loading historical documents, prefer targeted repository inspection, keep canonical artifacts concise, reuse accepted decisions, prefer deterministic gates to extra reviewer agents, and spawn subagents only when the expected parallel benefit exceeds duplicated context and coordination cost.

## Updates

`flow update` is explicit and deterministic. The default project template also contains:

```yaml
updates:
  check_on_run: true
  auto_update: false
```

For now, automatic checks are advisory rather than silently changing the installation. This avoids a framework update changing workflow behavior in the middle of active work. Projects can adopt a newer Flow version intentionally with `flow update`.

## Package

The executable is `flow`. The npm package is currently `@caiqueoak/flow` so it does not collide with the pre-existing unscoped `flow` package.

```bash
npx @caiqueoak/flow install --target .agents/skills
npx @caiqueoak/flow init
```

## Releases

Flow follows [Semantic Versioning](https://semver.org/). Public releases are made from an annotated `vX.Y.Z` tag whose version exactly matches `package.json`; GitHub Actions runs the test and packaging checks, then publishes the package to npm with provenance.
