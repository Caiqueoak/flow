# Flow

Flow is a readability-first, agent-agnostic software delivery workflow for coding agents. It maximizes autonomous execution while keeping consequential product and engineering decisions under developer control.

## Install

```bash
npm install --save-dev @caiqueoak/flow
npx flow init
```

`flow init` is interactive, or use `--runtime codex,claude` in automation. Built-in adapters install the public `/flow` skill in `.codex/skills/flow/` or `.claude/skills/flow/`; a custom project-local skills directory is also available interactively.

Skills are always installed inside the current project. Runtime integration directories never contain project state. If `.flow/` already exists, `flow init` only adds coding-agent integrations and updates `.flow/config.yaml`; it does not modify canonical project artifacts.

## Project bootstrap

`flow init` creates only:

```text
.flow/
└── config.yaml
```

It does not create a PRD, engineering guide, backlog, state, decisions, work items, gates, or templates. The `/flow` skill creates those artifacts only when they become valid canonical project information.

## Workflow

There is one public skill:

```text
/flow
```

Use `/flow <intent>` to start or change work, for example `/flow I want to build a diet app`. Use `/flow` with no extra input to continue from `.flow/STATE.md`.

Flow internally loads only the guidance needed for discovery, planning, build, review, or reconciliation. It asks only for consequential decisions and uses the largest safe degree of parallelism.

## Update

Updates are explicit:

```bash
npx flow update
```

`flow update` updates the npm package and refreshes `/flow` for every coding agent configured in `.flow/config.yaml`. There is no background update check or automatic update mechanism.

## CLI

```text
flow init
flow update
flow --version
flow --help
```

The CLI bootstraps project-local integrations and configuration. The coding agent plus `/flow` owns discovery, planning, scheduling, delegation, build, gates, review, reconciliation, and state synchronization.
