---
name: flow
description: Spec-driven software delivery for new and existing repositories. Use when planning, implementing, refactoring, fixing or continuing project work with requirements, design, task IDs, TDD, Git traceability and dependency-aware execution.
---

# Flow — skill-first software delivery

Use native agent tools, Git and Markdown. The Flow CLI is **not required**. Do not invoke `flow doctor`, `flow route`, `flow sync` or other Flow runtime commands for this workflow.

## Start or resume
1. Inspect the user's request, repository, `.flow/` documents and relevant tests. Never treat documentation as more authoritative than observed code behavior.
2. If `.flow/` is missing, initialize the minimal project documents under `.flow/` using `references/project.md`. For brownfield code, inspect the architecture and ask about preserve/incremental/refactor **only if the requested work requires an architectural choice**; never authorize broad refactoring implicitly.
3. If continuing, reconcile `progress.md`, task checkboxes and Git commits before selecting work; missing or ambiguous evidence is a blocker to claiming completion.
4. Classify the change. Small, bounded fixes may have concise requirements/design and a single task; substantive work uses the full work-item documents. Avoid documentation ceremony for its own sake.
5. Select an eligible work-item from `graph.md` and its declared dependencies. Prefer one active work-item, but allow parallel independent tasks/workers after evaluating dependency order, file overlap, mutable shared resources, isolation, integration and verification cost.
6. Execute tasks to completion using `references/delivery.md`. Do not stop after planning unless the user explicitly requests a plan or a genuine decision/blocker prevents implementation.
7. Verify acceptance criteria; reconcile graph and progress; report delivered work, evidence and remaining blockers.

## Project state
The durable project files are:
- `.flow/prd.md`: global product purpose, scope and enduring requirements.
- `.flow/engineering.md`: observed architecture, shared technical policies and decisions.
- `.flow/progress.md`: concise, current human-readable state and resumption hints.
- `.flow/graph.md`: view of work-item dependency DAG.
- `.flow/work-items/W###-slug/requirements.md`: outcome, scenarios and verifiable acceptance criteria.
- `.flow/work-items/W###-slug/design.md`: solution, affected interfaces and technical decisions.
- `.flow/work-items/W###-slug/tasks.md`: atomic task identities, dependencies, statuses and verification.

A work-item is one outcome; task IDs have the form `W001-T001`. Keep identity stable. Specs own their requirements and dependencies; `graph.md` summarizes these, and `progress.md` summarizes task/work-item state. Avoid competing sources of truth. Preserve completed history.

## Commit contract
Default: **TDD (red → green → refactor) and one coherent commit per implementation task** after verification. Subject only:
`feat(auth): implement password validation [W001-T001]`

Use an appropriate conventional type and scope. **Do not add Flow trailers** or require separate test/implementation commits. Commit tests and implementation together. Verify the commit contains only the task's changes; never claim an uncommitted or failed task complete. Where TDD is inapplicable (documentation, configuration, exploratory work), use explicit fit-for-purpose checks.

## Decisions and safety
Ask only when an essential choice is ambiguous, an external action is needed, or an irreversible action needs authorization. Preserve user changes; don't reset, rewrite history or delete old Flow artifacts without authorization. Legacy CLI projects can be migrated incrementally by mapping existing work-items/IDs and retaining history; do not silently discard state.

Read `references/project.md` when initializing/updating project documentation, and `references/delivery.md` before creating work-items or executing tasks.
