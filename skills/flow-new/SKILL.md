---
name: flow-new
description: Bootstrap Flow from a broad idea or existing project sources, resolve consequential global product and engineering decisions, define a production-capable MVP, and create the initial work DAG.
---

# Flow New

## Objective

Create enough shared product, engineering, infrastructure, and quality context to define a coherent production-capable MVP without prematurely specifying work-item details.

## Readability principle

Flow is readability first. Write canonical artifacts so a reader can understand the project without knowing Flow internals. Prefer clear prose and explicit names over compressed notation.

## Inputs

Support all of these without changing the workflow contract:
- greenfield idea;
- existing PRD/PRFAQ/specifications;
- existing codebase;
- existing codebase plus product documentation.

Existing source documents are inputs, not permanent runtime context. Synthesize them into small canonical `.flow/` artifacts and refer back to sources only when a later work item requires specific detail.

## Global discovery

Resolve only consequential global decisions needed to define:
- product problem, users, boundaries, and MVP outcome;
- production constraints and deployment model;
- architecture and project/module boundaries;
- infrastructure, persistence, integrations, security/privacy, observability, and operations;
- global testing strategy and documentation expectations;
- reusable quality gates;
- technical constraints that shape product scope or work ordering.

Do not ask work-item-level questions that can safely wait for just-in-time planning.

## Decision authority

The agent MUST NOT silently make a consequential product or technical decision.

A decision is consequential when materially different choices can change product scope/behavior, MVP composition, architecture, module boundaries, public contracts, persistent data semantics, production infrastructure, security/privacy, operational cost/model, testing strategy, reusable quality gates, or cross-work assumptions.

Infer without asking when a choice is low-impact, reversible, and has a clear ecosystem/repository convention. Do not ask trivial convention questions such as kebab-case vs snake_case when the selected language/framework or existing repository establishes a normal choice.

## Decision batch protocol

Ask the largest set of consequential decisions that are CURRENTLY KNOWN and can be answered independently. Do not speculate about future scenarios merely to enlarge a batch.

If decision B depends on decision A, ask A first and defer B until A is resolved.

Every decision presented for approval MUST include:
1. **Decision** — what must be chosen.
2. **Context** — why the choice exists now and why it matters.
3. **Options** — realistic alternatives and their meaningful trade-offs.
4. **Recommended option** — exactly one when a recommendation is possible.
5. **Why recommended** — concise reasoning grounded in current constraints.
6. **Impact** — product, engineering, gates, and work items likely affected.

Record unresolved consequential decisions as `pending_user` in `DECISIONS.yaml`. After a choice is provided, record the accepted choice and synchronize affected canonical artifacts.

## MVP rule

Discovery MUST converge on a production-capable MVP, not only a feature list. Include both product and technical work required to build, validate, deploy, and operate the MVP at its intended scale.

Stop global discovery when there are no unresolved global decisions necessary to define a coherent production-capable MVP and its initial work DAG.

## Work DAG

Populate `BACKLOG.yaml` with work items of kind:
- `feature` — user/product capability;
- `technical` — enabling architecture, infrastructure, quality, or platform work;
- `maintenance` — reconciliation, migration, refactor, or corrective work created by later decisions.

Dependencies represent real blockers only. A work item may be impacted by a decision without depending on another work item.

Use universal IDs (`W001`, `W002`, ...). Work item folders use `<sequence-padded><kind-code>-<slug>` where `F` = feature, `T` = technical, and `M` = maintenance. Examples: `001F-user-profile`, `002T-production-baseline`, `003M-auth-reconciliation`. The numeric prefix is a stable readable sequence, NOT execution order; the DAG controls execution.

## Gates

During discovery, propose reusable gates when they materially increase confidence in approved engineering/product rules. Explicit approval is required for consequential reusable gate policy. Prefer command gates for objectively testable rules and agentic gates for judgment-based policy.

## Required outputs

Synchronize automatically:
- `.flow/PRD.md`
- `.flow/ENGINEERING.md`
- `.flow/SUMMARY.md`
- `.flow/DECISIONS.yaml`
- `.flow/BACKLOG.yaml`
- `.flow/STATE.yaml`
- `.flow/gates/` when gates are approved

The user must never need to say “update state/docs”.

## Token-efficiency rules

- Synthesize large source documents once; do not keep re-reading them wholesale.
- Read only source sections needed to resolve the current decision.
- Do not map the whole repository when targeted inspection answers the question.
- Avoid duplicated prose across PRD, ENGINEERING, SUMMARY, and decisions.
- `SUMMARY.md` is a concise derived view, not another source of truth.
- Do not spawn subagents unless parallel research/inspection has clear value greater than coordination/context overhead.
