# Flow

Flow is a readability-first, agent-agnostic software delivery workflow for coding agents. It maximizes autonomous execution while keeping consequential product and engineering decisions under developer control.

## Install

```bash
npm install --save-dev @caiqueoak/flow
npx flow init
```

`flow init` is interactive, or use `--runtime codex,claude` in automation. Built-in adapters install the public `/flow` skill in `.codex/skills/flow/` or `.claude/skills/flow/`; a custom project-local skills directory is also available interactively.

Skills are always installed inside the current project. Runtime integration directories never contain project state. If `.flow/` already exists, `flow init` only adds missing coding-agent integrations and updates `.flow/config.yaml`. If all built-in integrations are already configured, it exits without prompting. It does not modify canonical project artifacts.

## Project bootstrap

`flow init` creates only:

```text
.flow/
└── config.yaml
```

It does not create a PRD, engineering guide, backlog, graph, state, decisions, work items, gates, or templates. During `/flow`, new project documents and artifacts are created only when the developer explicitly requests or authorizes them. Flow updates existing approved artifacts instead of inventing ad-hoc progress, summary, handoff, or status documents.

## Workflow

There is one public skill:

```text
/flow
```

Use `/flow <intent>` to start or change work, for example `/flow I want to build a diet app`. Use `/flow` with no extra input to continue from `.flow/STATE.md`.

Flow internally loads only the guidance needed for discovery, planning, build, review, or reconciliation. It asks only for consequential decisions and uses the largest safe degree of parallelism. Once execution is underway, it does not stop merely to announce completed tasks, progress, or next steps; it continues automatically until developer input, external approval, an unrecoverable blocker, or no ready work requires a real stop.

When authorized, Flow keeps a concise artifact model: product truth in `PRD.md`, engineering truth in `ENGINEERING.md`, decisions in `DECISIONS.md`, execution context in `STATE.md`, the canonical work-item DAG in `BACKLOG.yaml`, and a human-readable derived projection in `GRAPH.md`. Work items use `SPEC.md` plus `TASKS.yaml`. `SUMMARY.md` is not part of the model.

In `GRAPH.md`, work-item states are consistent: complete is green, in progress is blue, blocked is red when unfinished dependencies remain, and pending is yellow when all dependencies are complete and the item is ready to execute. Each Mermaid card contains only the work-item ID and canonical title. Every dependency arrow goes from dependency to dependent item and uses the color and line style of its source card. `flow graph` deterministically regenerates this projection from `BACKLOG.yaml`, using straight Mermaid arrows only.

## Update

Updates are explicit:

```bash
flow update
```

`flow update` updates the installation that provides the active CLI: the global package for `flow update`, or the project dependency for `npx flow update`. It uses npm's update operation and refreshes `/flow` for every coding agent configured in `.flow/config.yaml` without modifying canonical project state. If the project lockfile and the package on disk disagree, Flow safely reinstalls only its own package before updating.

On Windows, npm is invoked through `cmd.exe` without Node's `shell: true` option, so `npm.cmd` executes without the `DEP0190` warning. When Flow is installed as a project dependency, `npx flow update` is equivalent.

There is no background update check or automatic update mechanism.

## Releases

Merges to `main` are released automatically after the test matrix passes. The release pipeline uses npm Trusted Publishing (OIDC), creates a signed npm provenance record, and tags the release; no npm token or manual version bump is needed.

Use Conventional Commit prefixes in the PR title (and retained commits): `fix:` produces a patch, `feat:` a minor, and `feat!:` or a `BREAKING CHANGE:` footer a major release. `docs:`, `test:`, `chore:`, and `ci:` do not publish a package.

## CLI

```text
flow init
flow update
flow graph
flow --version
flow --help
```

The CLI bootstraps project-local integrations and configuration. The coding agent plus `/flow` owns discovery, planning, scheduling, delegation, build, gates, review, reconciliation, and state synchronization.
