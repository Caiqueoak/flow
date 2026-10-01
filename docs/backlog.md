# Flow vNext Backlog

Working notes for the next Flow iteration. This file captures design decisions and open questions before implementation.

## Direction

- Use BMAD as a reference/base for Flow skills, reusing mechanisms that fit instead of copying its full workflow or artifact structure.
- Prefer skill-driven judgment over deterministic workflow scripting.
- Keep CLI/scripts focused on structural primitives and integrity: doctor, repository/state inspection, IDs, traceability, basic schema validation, recovery primitives, and Git facts.
- Promote behavior to deterministic enforcement only when model/skill guidance proves insufficient in practice.
- Keep Flow runtime-agnostic across capable agent runtimes such as Codex and Claude Code.

## Discovery and scope definition

- Do not use a rigid, typed `delivery posture` taxonomy as the primary discovery mechanism.
- Discovery should calibrate the real project context organically: users, stakes, longevity, distribution, UX expectations, data, operations, cost, failure impact, and other dimensions relevant to the specific product.
- Discovery must not advance to scope/PRD finalization until every relevant dimension identified by the discovery skill has been answered or explicitly resolved.
- The skill must maintain awareness of unresolved dimensions so the agent cannot simply forget one and continue.
- Ask questions in batches only when answers are sufficiently independent. Questions whose answers depend on earlier answers must wait for a later batch.
- When useful, provide options plus a recommended option and concise rationale, while leaving the decision with the user.
- Include an explicit challenge/grill step inspired by BMAD/forge-style elicitation so plausible assumptions are pressure-tested before implementation.
- The next question batch must be derived from prior answers, not pre-scripted.

## Product and UX definition

- Treat UX/experience as an upstream input when relevant, not something invented during implementation.
- Allow the experience skill to choose the minimum useful artifact:
  - journeys/interactions;
  - wireframes;
  - static/mock prototype without backend/integration.
- A prototype is specification-by-example and may be disposable; it must not silently become the production architecture.
- User approval of important experience decisions should happen before production implementation depends on them.

## Engineering

- Keep `engineering.md` as the normative project architecture/topology source of truth.
- Architecture should describe concrete system shape, ownership, dependency direction, slice organization, naming/readability expectations, and explicit exceptions.
- Material architecture changes require revisiting the engineering definition before implementation silently establishes a second architecture.
- Preserve Flow's readability-first principles: Clean Code pragmatically, KISS, SRP, SSOT, low coupling/high cohesion, semantic naming, locality, and intent before mechanics.

## Orchestration and subagents

- The main chat agent should primarily act as orchestrator and reviewer.
- Implementation work can be delegated to fresh-context subagents/workers.
- Workers receive only the bounded context needed for their assignment and return implementation results, verification evidence, decisions, and blockers.
- The orchestrator remains responsible for user interaction, synthesis, integration judgment, architectural consistency, and the final review opinion.
- The model decides dynamically whether to spawn subagents, how many to spawn, which responsibilities to delegate, and which executions should be parallel versus sequential.
- Do not encode a fixed worker count or mechanically spawn one agent per task.
- Flow skills must provide a strong orchestration baseline so capable models converge on good performance rather than improvising from scratch. The baseline should teach the model to weigh task/work-item size, cohesion, dependency shape, likely change-surface overlap, context cost, integration cost, and verification needs.
- A sufficiently cohesive work item may be better implemented by one worker rather than artificially decomposed.
- A small change may be better handled directly by the orchestrator.
- Tasks should be large enough to represent a meaningful implementation responsibility; avoid micro-tasking solely to enable parallelism.

## Parallelism

- Prefer one active work item at a time as the normal delivery baseline.
- Parallelism is an orchestration decision, not a fixed graph rule: the model decides when parallel execution helps and how many concurrent workers are appropriate.
- Prefer parallelism inside the active work item when there are genuinely independent implementation responsibilities.
- Work-item parallelism is not a default optimization target.
- `depends_on` is evidence for orchestration but is not sufficient by itself to authorize parallel execution.
- Before parallelizing, the skill should direct the model to consider:
  - semantic dependency;
  - architectural ownership;
  - likely file/change-surface overlap;
  - shared mutable resources/configuration;
  - integration and merge cost;
  - whether parallelism materially reduces elapsed work;
  - whether the workers can receive clear, bounded contexts and acceptance criteria.
- The skill should establish baseline heuristics for expected performance while preserving model judgment. It should help avoid both under-parallelization of obviously independent work and over-parallelization that creates coordination overhead.
- The baseline is guidance, not a fixed concurrency cap: the model may choose fewer or more subagents when the actual dependency graph and change surface justify it, and should keep the orchestration proportional to the work.
- Depending on the work, valid decisions include:
  - orchestrator handles directly;
  - one worker handles the whole work item;
  - one worker handles a meaningful task or coherent task group;
  - multiple workers execute selected independent tasks in parallel;
  - some tasks run in parallel while dependency-sensitive work remains sequential.
- Parallel read-only review/research agents are lower risk and can be used more freely than parallel writers.

## Worktrees, branches, and PR lifecycle — investigate

Potential model:

1. isolate implementation in a branch/worktree;
2. complete and review the active work item;
3. user validates/accepts the work item;
4. publish the branch;
5. create a PR;
6. remove the local worktree so it does not accumulate on disk.

Questions to resolve before adopting this:

- Is a worktree actually necessary if only one work item is active and the graph only parallelizes tasks?
- If task workers write concurrently, should they share one worktree, receive separate task worktrees, or avoid concurrent writes entirely?
- Would one worktree per task create more merge/synchronization cost than value?
- How should workers stay synchronized with the canonical repository when the user or another process changes the original checkout?
- What happens when shared files such as package manifests, schemas, app composition, migrations, or global config are touched by multiple workers?
- How are conflicts surfaced without making Flow itself a Git orchestration engine?
- Should a worktree be created only when actual concurrent writers or isolation risk justify it?
- Should the branch boundary be the work item rather than the task, even if workers execute tasks inside it?

Current preference to test: **one active work item and one work-item branch; use worktrees only when isolation/concurrent writes clearly justify them rather than making them mandatory.**

## Context lifecycle / Ralph-style loop

- Treat worker contexts as disposable; fresh worker context is the primary context-management mechanism.
- Persist everything needed to continue in canonical project artifacts rather than relying on chat history.
- At stable boundaries (approved PRD, experience, engineering, completed work item), allow the orchestrator to rehydrate from canonical state instead of carrying transient reasoning indefinitely.
- Candidate work-item loop:
  1. rehydrate canonical state;
  2. select/decompose ready work;
  3. delegate as appropriate;
  4. integrate results;
  5. perform independent review;
  6. repair if required;
  7. obtain user work-item validation where required;
  8. persist;
  9. discard transient context and continue fresh.

## Review

- Review must produce a human-readable **parecer**, not merely a status field.
- The review should explain:
  - what was delivered;
  - whether intent and acceptance criteria are met;
  - engineering/experience conformance;
  - important edge cases and verification gaps;
  - concrete blockers or requested changes;
  - residual risks.
- The orchestrator should review work it did not implement when practical, reducing self-review bias.
- Review can use specialized subagents/lenses (acceptance, engineering, edge cases, verification) when proportional to the change, with the orchestrator synthesizing the final parecer.
- Machine-readable review metadata may exist for routing, but it is not a substitute for the review opinion.

## POC / evaluation

- The first Flowboard POC was implemented with GPT-6 Luna. Treat its behavior as evidence about skill quality rather than assuming model weakness.
- Re-run comparable scenarios across models later to measure how much behavior comes from Flow versus model capability.
- Useful measurements:
  - unresolved discovery dimensions skipped;
  - assumptions made without user decision;
  - unnecessary questions;
  - work-item/task granularity;
  - delegation decisions;
  - safe/unsafe parallelization;
  - engineering conformance;
  - review findings and repair quality;
  - user interventions;
  - context size/rehydration effectiveness.

## Open implementation principle

Flow should be opinionated about **quality of reasoning, contracts, boundaries, handoffs, orchestration heuristics, and evidence**, while remaining adaptive about **how many questions, steps, workers, parallel executions, or artifacts a particular change actually needs**.
