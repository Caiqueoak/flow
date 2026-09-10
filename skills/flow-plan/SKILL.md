---
name: flow-plan
description: Plan a ready feature, technical, or maintenance work item just in time, resolve consequential local decisions, reconcile cross-work impacts, define gates, and create a dependency-aware task DAG.
---

# Flow Plan

## Objective

Turn one ready work item into an implementation-ready specification and task DAG while preserving all approved global product and engineering decisions.

## Context loading

Start with `.flow/STATE.yaml`, `.flow/BACKLOG.yaml`, and `.flow/SUMMARY.md`. Read only the relevant sections of `PRD.md`, `ENGINEERING.md`, `DECISIONS.yaml`, and gates needed for this work item. Do not reload unrelated completed work.

## Work item selection

Plan a requested work item or the highest-priority ready work item selected by the orchestrator. Mark it `in_progress` with the current `execution_id` before beginning mutating work.

Create `.flow/work-items/<sequence-padded><kind-code>-<slug>/SPEC.md` and `TASKS.yaml` from templates.

## Just-in-time discovery

Ask detailed questions only when answers materially affect this work item's behavior, scope, UX, contracts, data semantics, architecture application, infrastructure interaction, security/reliability, acceptance criteria, or gates.

Reuse accepted global decisions. Applying an approved rule is not a new decision.

Do not ask trivial implementation questions when a clear language/framework/repository convention or approved engineering rule provides the answer.

## Consequential decisions

Never silently choose a consequential local or global decision. Use the same six-part decision format as `flow-new`: Decision, Context, Options, Recommended option, Why recommended, Impact.

Batch the maximum set of currently-known independent decisions; do not invent speculative future cases to create a larger batch.

If a work-item decision establishes or changes a project-wide rule, treat it as a global technical/product decision, obtain developer approval, record it in `DECISIONS.yaml`, update `PRD.md` or `ENGINEERING.md`, and calculate impacted work.

## Reconciliation and cross-work impact

When a new accepted decision impacts another work item:
- pending/ready/planned item: mark `needs_reconciliation` when its assumptions/spec may be stale;
- in-progress item owned by another execution: do not modify its work; record the impact and surface the coordination issue;
- completed item: create a `maintenance` work item when code/data/config must be reconciled or migrated.

Decision impact is not the same as dependency. Use dependencies only for actual execution blockers.

## Gates

Resolve all global gates applicable to the work item. During planning, propose work-item-specific gates when needed. If a proposed gate establishes a reusable project-wide standard, it requires developer approval and should be promoted to `.flow/gates/`. Keep one-off validation criteria in `SPEC.md`.

## Task DAG

Each task must include:
- ID and clear title;
- status;
- `depends_on` with only real blockers;
- affected areas when reasonably predictable;
- concise acceptance criteria;
- decision/gate references when relevant;
- execution ID when claimed.

Validate the DAG is acyclic. Do not create explicit waves; execution groups are derived dynamically from the DAG and conflict analysis.

## Specification readability

`SPEC.md` is the readable lifecycle document for the work item. Use:
- Overview
- Goal
- Scope / Non-Goals
- Product Decisions
- Engineering Decisions
- Requirements
- Acceptance Criteria
- Dependencies & Impact
- Validation Gates
- Validation Result
- Delivery Notes

Keep it concise. Update `Overview` on completion to reflect what was actually delivered. Do not create a completion-log or separate summary file per work item.

## Token-efficiency rules

- Inspect only code likely relevant to current decisions/tasks.
- Reuse global definitions instead of copying them into the spec.
- Refer to decision/gate IDs instead of duplicating long policies.
- Avoid research unless current evidence is insufficient for a consequential decision.
