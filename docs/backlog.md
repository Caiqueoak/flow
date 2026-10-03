# Flow vNext Backlog

Working notes and implementation status for Flow vNext. This file is a concise entrypoint for design decisions, open questions, and delivery progress.

## Implementation status

The accepted Flow vNext technical design is `docs/research/flow-vnext-technical-design.md`. It is authoritative for W1–W7 scope and dependencies; this backlog only summarizes delivery status.

Status entries track delivery state, while detailed implementation evidence and exact reviewed heads remain in the corresponding pull requests.

- **W1 — Decision-heavy work can stop and resume safely from repository state:** completed and merged via PR #53; main commit `2cdc079976829872dbfc759fdbdd0b9ea3e019cd`.
- **W2 — Approved project contracts remain trustworthy and experience routes correctly:** completed and merged via PR #56; main commit `9d94a4c24a4d43108c94d3d52c468dca15e8da59`.
- **W3 — Fresh chats recover the correct next safe action:** completed and merged via PR #59; main commit `5300028a3330d48fe82e78af61fc7d2964169daa`.
- **W4 — One active work item can execute independent tasks safely in parallel:** not started; W1/W3 prerequisites are merged and W4 is ready to start.
- **W5–W7:** not started; dependencies remain as defined by the technical design.

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
- Discovery completion rule: maintain a dynamic set of relevant dimensions as `resolved`, `unresolved`, or explicitly `deferred/not relevant`; scope/PRD presentation is blocked while any relevant dimension remains unresolved.
- Ask questions in batches only when answers are sufficiently independent. Questions whose answers depend on earlier answers must wait for a later batch.
- When useful, provide options plus a recommended option and concise rationale, while leaving the decision with the user.
- Include an explicit challenge/grill step inspired by BMAD/forge-style elicitation so plausible assumptions are pressure-tested before implementation.
- The next question batch must be derived from prior answers, not pre-scripted.

## Resumable draft state

- Every decision-heavy Flow phase must persist an incremental draft, not only the final approved artifact.
- Draft state must be updated as the user answers questions, makes decisions, rejects options, defers topics, or introduces new constraints.
- A fresh chat must be able to resume safely from repository state without depending on hidden chat context.
- Each decision-phase draft should preserve at least:
  - current phase and subphase;
  - decisions already made and their rationale when relevant;
  - unresolved dimensions/questions;
  - deferred/not-relevant dimensions;
  - assumptions still being tested;
  - latest user-approved direction;
  - next decision frontier / next safe action.
- Drafts must be clearly distinguishable from approved/final artifacts so partial thinking cannot be mistaken for an accepted contract.
- Drafts are temporary resumability state. When a decision phase is approved and its canonical artifact/state has been safely persisted, delete the corresponding draft instead of keeping parallel historical copies.
- Discovery is the first required case, but the same resumability principle applies to other decision-heavy phases such as experience/UX, engineering, planning, and review/recovery where state can span multiple conversations.
- Persist after meaningful decision batches/checkpoints rather than waiting until phase completion.
- Doctor/recovery behavior must verify that persisted draft state is internally consistent with canonical approved artifacts and Git/repository state before continuing.
- During Flow vNext implementation, audit the current repository to confirm where state is currently written, whether writes are consistent/atomic enough for resume, and where draft/checkpoint persistence is missing.

## Human checkpoints

- Default human checkpoints: approved PRD; experience/UX when relevant; approved engineering; and the end of each work item.
- The user may explicitly pre-authorize continuous execution through work-item checkpoints (for example, continue until MVP), but newly discovered consequential ambiguity still returns to the user.
- A work item is not considered definitively accepted until its implementation/review checkpoint is resolved.

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
- Non-simple implementation work must be delegated to one or more fresh-context subagents/workers. The orchestrator may implement directly only when the change is genuinely simple and bounded.
- Worker handoffs must optimize for token efficiency as well as correctness. Send the minimum context that still makes project rules, task objective, scope, relevant acceptance criteria, relevant engineering/experience constraints, explicit non-goals, dependencies, and expected verification unambiguous.
- Do not copy whole PRDs, engineering documents, work items, or repository history into a worker prompt when a relevant slice or stable file reference is sufficient.
- Worker outputs should also be compact: changed behavior/surface, verification evidence, material decisions/deviations, and blockers/residual risk. Avoid restating the prompt or narrating routine work.
- Use the work-item review history to evaluate whether the handoff contract is too thin or too verbose: repeated missed constraints, preventable repair findings, unnecessary exploration, and review churn are evidence for tuning the contract.
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
- Prefer the cheapest/fastest model that has demonstrated sufficient quality for a bounded worker role. Escalate model capability/reasoning when task ambiguity, integration risk, or review history shows the cheaper tier is insufficient.
- Runtime capability is adaptive rather than assumed: Claude Code supports a per-subagent `model` and explicitly documents routing workers to cheaper models such as Haiku. Current Codex tooling supports subagent model/reasoning selection in some multi-agent configurations and a default subagent model in configuration, but support can vary by Codex version/mode; Flow must detect/use the runtime capability when available and otherwise inherit the parent model without breaking the workflow.
- Depending on the work, valid decisions include:
  - orchestrator handles directly;
  - one worker handles the whole work item;
  - one worker handles a meaningful task or coherent task group;
  - multiple workers execute selected independent tasks in parallel;
  - some tasks run in parallel while dependency-sensitive work remains sequential.
- Parallel read-only review/research agents are lower risk and can be used more freely than parallel writers.

## Worktrees, branches, and PR lifecycle

Adopted baseline:

1. one active work item maps to one implementation branch;
2. create the draft PR after the first meaningful implementation/checkpoint is persisted and the branch is useful to publish, rather than creating empty PRs;
3. use a worktree only when isolation or concurrent writers materially justify it;
4. avoid parallel writers on the same likely change surface; shared manifests, schemas, migrations, app composition, routing, and global configuration are strong signals to serialize or assign one integration owner;
5. complete implementation and review on the work-item branch;
6. user validates/accepts the work item unless continuous execution was explicitly pre-authorized;
7. transition the PR out of draft / integrate according to repository policy;
8. delete any temporary worktree once it is no longer needed so it does not accumulate on disk.

Decision: **one active work item and one work-item branch; worktrees are optional isolation primitives, not a mandatory Flow abstraction.** Task-level worktrees are not the default and must justify their synchronization/integration cost.

## Context lifecycle / user-controlled reset

- Treat worker contexts as disposable; fresh worker context is the primary context-management mechanism.
- Persist everything needed to continue in canonical project artifacts rather than relying on chat history.
- Flow must never require the current chat to remain alive for continuity.
- Resetting the main/orchestrator chat context is a user action, not an automatic Flow action. The user may start a new chat at any time after a persisted checkpoint, and the new orchestrator must rehydrate from repository state.
- Flow may recommend a fresh chat when context has become large or a stable boundary has been reached, but it must not assume or perform the reset on the user's behalf.
- Candidate resumable work-item loop:
  1. rehydrate canonical state;
  2. select/decompose ready work;
  3. delegate as appropriate;
  4. integrate results;
  5. perform independent review;
  6. repair if required;
  7. obtain user work-item validation where required;
  8. persist a complete checkpoint;
  9. continue in the current chat or allow the user to resume from a fresh chat.

## Review

- Review history lives **inside the work-item artifact**; do not create a separate review file/tree as the canonical review backlog.
- The work item keeps an append-only history of task/work-item review passes so a future agent can see what the reviewer/orchestrator checked, what it found, what repairs it requested, and how each finding was resolved.
- Each review pass must produce a human-readable **parecer**, not merely a status field.
- Findings should use stable IDs where useful so later passes can mark them resolved, superseded, accepted as residual risk, or carried forward without erasing history.
- The review history should make the reviewer/orchestrator actions traceable: scope inspected, evidence checked, findings raised, repair tasks created/reopened, and final disposition.
- The review should explain:
  - what was delivered;
  - whether intent and acceptance criteria are met;
  - engineering/experience conformance;
  - important edge cases and verification gaps;
  - concrete blockers or requested changes;
  - residual risks.
- The orchestrator should review work it did not implement when practical, reducing self-review bias.
- Review can use specialized subagents/lenses (acceptance, engineering, edge cases, verification) when proportional to the change, with the orchestrator synthesizing the final parecer.
- Review outcomes use a small routing vocabulary such as `approved`, `changes_required`, and `blocked`; machine-readable metadata exists for routing/history but is not a substitute for the parecer.
- Review history is also the primary empirical feedback loop for worker-contract/model tuning: identify which omissions or cheap-model failures repeatedly generate repair work, then adjust the minimum handoff context or model-selection baseline rather than expanding every prompt preemptively.

## BMAD → Flow harvest before implementation

- Before implementing Flow vNext, perform a systematic comparison of the relevant BMAD skills and classify each useful mechanism as `reuse concept`, `adapt`, or `discard`.
- Prioritize discovery/elicitation, challenge/forge, PRD create-update-validate, UX/experience, architecture, and review/context-handoff patterns.
- Reuse BMAD as a design reference, not as a dependency or rigid workflow to copy.

## POC / evaluation

- The first Flowboard POC was implemented with GPT-6 Luna. Treat its behavior as evidence about skill quality rather than assuming model weakness.
- Re-run comparable scenarios across models later to measure how much behavior comes from Flow versus model capability.
- Useful measurements:
  - worker input/output token cost when the runtime exposes it;
  - review findings attributable to missing handoff context versus implementation quality;
  - repair/retry rate by worker model/tier;
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
