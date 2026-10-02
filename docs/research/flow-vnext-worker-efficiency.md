# Flow vNext worker/subagent efficiency research

Research date: 2026-10-01 (America/Sao_Paulo)

Flow baseline verified before research:

- repository: Caiqueoak/flow
- main: 47c3b45ea6d228636500636c92dbb1b7b755b8ae
- repository rules read: AGENTS.md
- design baseline read: docs/backlog.md

This report is intentionally limited to worker/subagent spawning, model and reasoning routing, context isolation, parallel execution, worktree/isolation support, runtime/version limits, and token-efficient handoffs. It does not redesign Flow discovery, PRD, architecture, or state persistence.

## Executive conclusion

Flow vNext should treat worker orchestration as a runtime-capability problem, not a Claude-versus-Codex feature checklist.

Both current Claude Code and current local Codex clients officially support subagent workflows, parallel execution, and worker-specific model selection. Both can isolate noisy worker tool output from the orchestrator. The important differences are in how much parent context reaches a worker and how strongly filesystem isolation is guaranteed.

Claude Code currently has the more explicit worker-isolation contract:

- non-fork subagents start with fresh context;
- a subagent can select a model;
- a subagent definition can select an effort level;
- multiple independent subagents can run in parallel;
- a subagent can receive first-class Git worktree isolation;
- a fork can deliberately inherit the full parent context when that is cheaper or necessary.

Current Codex local clients also expose strong multi-agent routing:

- current releases enable subagent workflows by default;
- subagents can use explicit/default/custom-agent model and model_reasoning_effort settings;
- concurrent agent threads are supported and configurable;
- current open-source MultiAgentV2 supports selecting how many parent turns to fork;
- noisy worker output stays in the worker thread and the parent receives distilled results.

However, Flow must not assume all Codex surfaces expose the same spawn schema. Current Codex source can hide per-spawn model/reasoning overrides based on configuration, and the current spawn schema has no per-subagent cwd/worktree argument. Codex worktrees are officially supported for chats/sessions, but per-spawn worker worktree isolation is not a documented or currently implemented spawn primitive.

Therefore the Flow baseline should be:

1. discover runtime capabilities;
2. keep the orchestrator on the model appropriate for integration judgment;
3. send bounded work to the cheapest worker tier with demonstrated success for that task shape;
4. default to fresh/minimal worker context plus repository references;
5. use inherited/forked context only when reconstructing the needed context would cost more or lose important decisions;
6. parallelize read-heavy independent work freely within sensible limits;
7. parallelize writers only when their change surfaces are independent and the runtime provides reliable workspace isolation, or when separate top-level sessions/worktrees are externally orchestrated;
8. use work-item review history as the feedback loop for model, effort, context, and parallelism tuning.

## Status vocabulary

This report uses three capability classes.

**Officially supported** means current vendor documentation explicitly documents the behavior for the relevant runtime.

**Version/configuration-dependent** means the capability exists, but availability, precedence, semantics, or exposure changes with runtime version, model, client surface, feature configuration, or project settings.

**Unsupported or uncertain** means Flow should not depend on the behavior because current documentation does not promise it, the current implementation lacks the required primitive, or only implementation/issue evidence exists without a stable public contract.

## Capability matrix

| Capability                    | Claude Code                                                                                                                                                                                               | Codex local clients                                                                                                                                                                                                                                                                                           | Flow implication                                                                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spawn subagents               | **Officially supported.** Built-in and custom subagents use the Agent mechanism.                                                                                                                          | **Officially supported.** Current releases enable subagent workflows by default in app, CLI, and IDE.                                                                                                                                                                                                         | Treat spawning as a normal optional runtime capability.                                                                                                                                     |
| Per-subagent model            | **Officially supported.** Per-invocation model, subagent model frontmatter, environment default, then parent model form the documented resolution order.                                                  | **Officially supported, with exposure caveat.** Docs support explicit spawn choice, agents defaults, and custom-agent model. Current V2 source can hide per-spawn model/reasoning fields.                                                                                                                     | Prefer explicit worker selection when exposed; otherwise select a configured role/default; otherwise inherit.                                                                               |
| Per-subagent reasoning effort | **Officially supported in subagent definitions.** effort overrides session effort. Available levels depend on model. Extended-thinking enable/disable itself is inherited and has no per-subagent toggle. | **Officially supported, model/client-dependent.** model_reasoning_effort can be set explicitly, globally for subagents, or in custom agent config.                                                                                                                                                            | Model and effort are separate routing dimensions. Never assume every level exists on every model/client.                                                                                    |
| Fresh input context           | **Officially supported and default for non-fork subagents.** They do not receive conversation history, previously invoked skills, or files already read.                                                  | **Version/configuration-dependent.** Separate agent threads are official, but current MultiAgentV2 source defaults fork_turns to all unless otherwise selected and also supports none or a positive number of turns. User-facing docs do not currently present fork_turns as a stable configuration contract. | Flow must explicitly request minimal/fresh context where the runtime exposes that control; do not assume Codex workers are input-isolated merely because their output is in another thread. |
| Full parent-context fork      | **Officially supported.** Forked subagents inherit the whole conversation and share the parent prompt cache.                                                                                              | **Implementation-supported in current MultiAgentV2; public surface varies.** Current source supports full or bounded turn forking.                                                                                                                                                                            | Use only when broad parent context is materially cheaper/safer than reconstructing a bounded handoff.                                                                                       |
| Parallel execution            | **Officially supported.** Independent subagents can run simultaneously; current default Agent-tool concurrency limit is 20 and configurable.                                                              | **Officially supported.** Parallel subagents are a documented use case; configurable per-session concurrency exists, while the default is runtime-owned.                                                                                                                                                      | Flow chooses concurrency from task shape, not the runtime maximum.                                                                                                                          |
| Nested delegation             | **Officially supported, version-sensitive.** Current default is up to three layers below main; historical defaults changed.                                                                               | **Supported in current multi-agent implementation, but backend/version semantics differ.**                                                                                                                                                                                                                    | Avoid nested delegation by default. Let the orchestrator own decomposition unless a delegated responsibility naturally contains independent children.                                       |
| Per-subagent Git worktree     | **Officially supported.** isolation: worktree gives the subagent a temporary isolated checkout with enforcement.                                                                                          | **Unsupported as a current spawn primitive.** Chat/session worktrees are official, but current spawn_agent has no cwd/worktree field.                                                                                                                                                                         | Parallel Claude writers can use per-worker worktrees. Parallel Codex writers should normally serialize or use separately orchestrated sessions/worktrees.                                   |
| Session/chat worktree         | **Officially supported.** --worktree, EnterWorktree, desktop worktrees.                                                                                                                                   | **Officially supported.** Codex desktop can start chats in managed worktrees and preserve/handoff their Git state.                                                                                                                                                                                            | Useful as a higher-level isolation mechanism, but not equivalent to per-subagent isolation.                                                                                                 |
| Worker output isolation       | **Officially supported.** Verbose worker operations stay in the worker context and only the result returns.                                                                                               | **Officially supported.** Docs explicitly recommend subagents to keep noisy exploration/tests/logs out of the main thread and return summaries.                                                                                                                                                               | Make compact structured worker outputs the contract.                                                                                                                                        |
| Usage/token visibility        | **Partly supported/runtime-dependent.** Subagent transcripts and compaction metadata expose some token-related information; billing/usage visibility depends on runtime/provider.                         | **Runtime-dependent.** Token usage availability differs by surface and telemetry.                                                                                                                                                                                                                             | Metrics must accept missing token/cost fields and still work from review outcomes, retries, elapsed time, and output size.                                                                  |

## Claude Code findings

### Spawning and routing

Claude Code documents custom and built-in subagents as separate context windows with their own system prompt, tools, and permissions. It explicitly recommends routing bounded tasks to cheaper models such as Haiku when appropriate.

The documented model resolution order is:

1. per-invocation model;
2. subagent definition model;
3. CLAUDE_CODE_SUBAGENT_MODEL;
4. main-conversation model.

This is useful for Flow because it allows a runtime adapter to make a worker-level decision without forcing the entire orchestration session onto that model.

Important version differences:

- before v2.1.251, CLAUDE_CODE_SUBAGENT_MODEL had higher precedence and could override definition/invocation choices;
- before v2.1.211, a resumed subagent could lose its per-invocation model;
- CLAUDE_CODE_SUBAGENT_MODEL_FORCE requires v2.1.257;
- model/effort display in task status requires v2.1.242.

Flow should therefore record the Claude Code version with worker evidence and should not infer routing precedence from old runs.

### Reasoning effort

Current Claude Code subagent definitions support an effort field with low, medium, high, xhigh, and max values where the selected model supports them. It overrides session effort.

This is distinct from Claude Code extended thinking. Since v2.1.198, a normal subagent inherits whether extended thinking is enabled in the parent session; current docs explicitly say there is no independent per-subagent thinking on/off setting.

Recommended Flow interpretation:

- model tier and effort level can be tuned per worker role;
- do not model Claude Code as having a fully independent worker-level extended-thinking toggle;
- if Flow needs highly dynamic per-invocation effort and the runtime surface does not expose it directly, route through a worker definition/config that encodes the desired effort rather than pretending the Agent invocation itself always accepts it.

### Context isolation

A normal Claude Code subagent starts fresh. It does not see parent conversation history, already invoked skills, or files the parent read.

It can still receive project instructions automatically:

- its own system prompt;
- delegation task message;
- the applicable CLAUDE.md hierarchy and loaded AGENTS.md instructions for normal custom/general-purpose subagents;
- a Git status snapshot;
- explicitly preloaded skills.

Built-in Explore and Plan intentionally skip CLAUDE.md and Git status to stay cheap. omitClaudeMd can suppress most instruction loading for a custom subagent and requires v2.1.271 or later.

This makes Claude Code a good fit for Flow's preferred handoff style: keep the prompt small, give exact repository references, and let the worker read only the bounded artifacts/source it actually needs.

### Forks

Claude Code also has a deliberate opposite mode: a forked subagent.

A fork inherits the entire parent conversation, system prompt, tools, model, and message history. Its tool calls stay outside the main transcript and only its final result returns. The first request can reuse the parent's prompt cache, so the vendor documentation explicitly notes that a fork can be cheaper than a fresh subagent when the task genuinely needs the same large context.

Key version notes:

- /subtask requires v2.1.212 or later;
- interactive fork mode defaults on from v2.1.232;
- older versions used /fork for the in-session fork behavior.

Flow should not use a fork merely because it is convenient. A fork defeats input-context isolation and may carry irrelevant historical context. It is appropriate when the worker needs a broad set of recent conversational decisions that are not yet cheaply reconstructable from persisted artifacts.

### Parallelism

Claude Code officially supports parallel independent subagents. The docs specifically recommend it for independent research paths and warn that each worker spends its own tokens and that detailed result payloads can flood the main context.

Current docs state a default limit of 20 running Agent-tool subagents, configurable through CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS from v2.1.217. That is a runtime ceiling, not a target.

Nested agents currently default to up to three layers below the main conversation, but this changed across v2.1.172-v2.1.219.

Flow should use a much smaller dynamic fan-out based on useful independent responsibilities. The fact that the runtime allows 20 workers does not make 20 workers economical.

### Worktree isolation

Claude Code officially supports isolation: worktree on a subagent. It creates a temporary Git worktree, applies protections against writing or redirecting Git operations back into the main checkout, and cleans clean worktrees automatically.

This is the strongest current primitive for safe parallel writers among the two runtimes researched here.

There is an important base-branch nuance. By default, Claude-created worktrees use the repository's default branch rather than the parent session's current HEAD. Current settings allow worktree.baseRef = head when isolated workers need in-progress feature-branch state.

For Flow, an isolated implementation worker must start from the exact active work-item state. Therefore one of these must be true before delegation:

- the runtime worktree is configured to branch from the relevant current HEAD;
- Flow creates/chooses a worktree from the exact work-item branch or commit;
- the work is intentionally based on the default branch.

Never assume isolation: worktree automatically includes unpublished parent-session changes.

## Codex findings

### Spawning and availability

Current OpenAI documentation says current Codex releases enable subagent workflows by default and surface them in the ChatGPT desktop app, Codex CLI, and IDE extension. Codex can delegate after a direct request or applicable AGENTS.md/skill instruction.

The documentation recommends subagents for:

- codebase exploration;
- test execution and analysis;
- triage;
- summarization;
- other independent tasks where parallelism helps.

It explicitly warns that each subagent performs its own model/tool work and consumes more tokens than a comparable single-agent run, and that parallel write-heavy work creates conflict and coordination risk.

This aligns closely with the existing Flow backlog direction.

### Model and reasoning routing

Current Codex documentation supports three ways to select worker model/reasoning:

- explicit spawn request;
- global [agents] defaults in config.toml;
- per-custom-agent model and model_reasoning_effort.

If neither is configured, a child inherits the parent's model and reasoning effort. If a model is selected without an explicit effort, the selected model's default effort is used.

Current docs specifically position:

- gpt-6-luna as the fast/lower-cost choice for narrow, repeatable, high-volume worker tasks;
- gpt-6.1-sol as the more capable choice for demanding, ambiguous, multi-step tool work.

Reasoning levels are model/client dependent. Current docs list low, medium, high, xhigh, max, and ultra where supported.

The [agents] configuration currently includes:

- enabled;
- max_concurrent_threads_per_session;
- default_subagent_model;
- default_subagent_reasoning_effort;
- interrupt_message.

The public docs say agents.enabled defaults true and intentionally do not promise one universal default thread cap when the cap is unset.

### Spawn-schema exposure is configuration-dependent

The current open-source Codex implementation adds an important limitation that the high-level docs do not fully expose.

MultiAgentV2 contains model and reasoning_effort in its SpawnAgentArgs, but the generated spawn tool schema can remove those fields unless expose_spawn_agent_model_overrides is enabled.

That means two statements can both be true:

- Codex supports worker-specific model/effort routing as a product capability;
- a particular live parent agent may not receive per-spawn model/effort fields in its current tool schema.

Flow should therefore treat per-spawn override as a capability to detect, not as a universal Codex assumption. If explicit fields are unavailable, Flow can still use configured [agents] defaults or custom-agent files when those mechanisms are under its control; otherwise the safe fallback is inherited model/effort.

### Context isolation and fork behavior

Codex documentation clearly promises output separation: worker exploration, logs, tests, and intermediate work can stay in their own agent threads while distilled summaries return to the main thread.

It is less safe to equate that with fresh input context.

Current open-source MultiAgentV2 has a fork_turns argument that accepts:

- none;
- all;
- a positive integer number of recent turns.

In the current source, omitted fork_turns resolves to all. The model-side multi-agent instructions also state that the parent can decide how much context to propagate.

This is valuable but should currently be classified as version/configuration-dependent for Flow because the public Subagents documentation does not present fork_turns as a stable user-level contract and different Codex multi-agent backends/surfaces exist.

Flow rule:

- when a Codex runtime exposes bounded context propagation, request none or the minimum number of parent turns needed;
- otherwise assume input context behavior is runtime-owned and keep the actual delegation message self-sufficient;
- never count on a fresh child context unless the runtime explicitly confirms it.

### Parallelism

Codex officially supports parallel agent threads and consolidates results when all requested workers finish. max_concurrent_threads_per_session allows a configured cap, while the default is runtime-selected.

Current open-source Codex contains separate V1 and V2 multi-agent implementations and different internal defaults. Those implementation constants should not become Flow policy.

Flow should set concurrency from work shape and observed review economics, not from whichever backend default happens to ship.

### Worktrees and filesystem isolation

Codex officially supports Git worktrees for chats in the ChatGPT desktop app. A worktree gives a chat its own checkout and can be based on a selected branch; managed worktrees can be handed off between Worktree and Local.

That is a session/chat isolation primitive.

Current Codex spawn_agent source has message, task_name, optional agent_type, model, reasoning_effort, fork_turns, and legacy fork_context handling. It does not expose cwd, workdir, workspace_path, or worktree.

An open enhancement request in the official openai/codex repository, issue #18969, specifically asks for cwd support because spawned subagents currently inherit the parent session workspace. The issue is useful corroborating evidence, not a product-roadmap guarantee.

Therefore:

- **per-chat worktree: officially supported;**
- **per-spawn subagent worktree/cwd: currently unsupported as a stable primitive;**
- **prompting a worker to cd into another worktree is not an isolation guarantee and must not be treated as one.**

For Flow, parallel Codex writers should either:

- write to clearly independent surfaces in one checkout only when collision risk is acceptably low;
- run sequentially;
- or be promoted to separately orchestrated top-level Codex sessions, each started in its own worktree.

## Runtime capability profile for Flow

Flow should normalize runtime differences behind a small conceptual capability profile rather than branching business rules on runtime name.

Recommended capability fields:

| Capability                  | Meaning                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| spawnWorkers                | runtime can launch child workers                                   |
| workerModelOverride         | a worker model can be chosen for this execution/configuration      |
| workerEffortOverride        | a worker reasoning effort can be chosen                            |
| contextModes                | supported modes such as fresh, full-parent, last-N-turns           |
| perWorkerWorkspaceIsolation | runtime can guarantee a distinct filesystem checkout for one child |
| maxConcurrentWorkers        | runtime-reported/configured ceiling when knowable                  |
| nestedWorkers               | child workers may spawn descendants                                |
| workerResume                | prior worker context can be resumed                                |
| usageMetrics                | input/output/cache/cost metrics exposed by the runtime             |
| runtimeVersion              | version/build used for evidence and compatibility                  |
| surface                     | CLI, IDE, desktop/app, SDK/non-interactive, or other relevant mode |

The orchestration skill should make decisions from this profile.

Safe degradation order:

1. if worker spawning is unavailable, orchestrator handles the work;
2. if worker model override is unavailable, inherit parent model;
3. if worker effort override is unavailable, inherit/model default;
4. if fresh/bounded context control is unavailable, send a minimal self-sufficient task and accept runtime-owned parent-context behavior;
5. if per-worker workspace isolation is unavailable, do not parallelize conflicting writers;
6. if usage metrics are unavailable, tune from review outcomes and retries instead of blocking.

## Cheapest-capable-model policy

Flow should route by task shape and evidence, not by a permanent model-name table.

### Tier E: economical worker

Use the cheapest/fastest supported worker tier for work that is all of the following:

- bounded;
- low ambiguity;
- low architectural consequence;
- easy to verify mechanically;
- easy to repair if wrong;
- limited in repository surface.

Typical responsibilities:

- targeted codebase search;
- locate ownership/interfaces;
- run and summarize tests;
- inspect logs;
- mechanical edits with explicit patterns;
- narrow documentation updates;
- repetitive checks;
- a focused review lens with concrete criteria.

Current examples are Claude Haiku and Codex gpt-6-luna, but Flow should resolve actual available models at runtime rather than hard-code these forever.

Default effort should be the lowest level that has demonstrated adequate quality for that worker role. Low is appropriate for deterministic/simple work; medium is the safer starting point when the worker still needs local reasoning.

### Tier S: standard capable worker

Use a standard capable model when the task is bounded but requires non-trivial reasoning, such as:

- a coherent multi-file implementation slice;
- tracing behavior through several layers;
- choosing among local implementation options under known architecture;
- writing non-trivial tests;
- investigating a failure with several plausible causes;
- reviewing interactions between components.

Current examples are Claude Sonnet and an available Codex Sol-class configuration.

Start with medium/default effort unless the task shape or review history justifies more.

### Tier H: high-capability worker

Use the strongest appropriate model and higher reasoning when mistakes are expensive or the task contains genuine ambiguity:

- architecture-sensitive changes;
- security or authorization;
- concurrency/race behavior;
- migrations/data integrity;
- broad refactors with subtle invariants;
- difficult debugging after a cheaper worker failed;
- review of consequential changes;
- work where acceptance criteria are underspecified but cannot safely be interpreted mechanically.

Current examples are Claude Opus and a higher-effort gpt-6.1-sol configuration, subject to actual runtime availability.

### Orchestrator model

The orchestrator does not need to be the cheapest worker model. It owns integration judgment, user decisions, cross-worker synthesis, architecture consistency, and final review opinion. Optimizing worker cost while weakening orchestration can increase total cost through bad decomposition and repair churn.

### Routing rule

Use the cheapest tier whose historical first-pass quality is adequate for the role and task shape.

Do not ask, “Can a cheap model possibly do this?” Ask, “Has this tier demonstrated acceptable first-pass outcomes for this bounded class of work, under this handoff contract and runtime?”

## Escalation criteria

Escalation can increase model capability, reasoning effort, context, or all three. Flow should identify the failure mode before adding cost.

Escalate **context**, not model, when:

- the worker missed a constraint that the handoff did not contain or reference;
- the worker could not locate the relevant approved decision;
- the task depends on an unpublished decision that only the orchestrator currently knows;
- the worker repeatedly explores the repository to rediscover information that a stable reference could have supplied.

Escalate **reasoning effort** when:

- the selected model is generally adequate but the task requires deeper edge-case tracing;
- review finds internally inconsistent reasoning rather than missing knowledge;
- a deterministic-looking task revealed non-obvious interactions;
- the worker needs to compare several plausible hypotheses.

Escalate **model capability** when:

- a cheaper model makes repeated implementation-quality errors with an adequate handoff;
- the task crosses architecture boundaries or requires integration judgment;
- a first repair pass failed to resolve the same substantive finding;
- security, concurrency, migration, or data-integrity risk is higher than initially classified;
- the worker reports unresolved ambiguity that is intrinsic to the task rather than missing context.

Escalate back to the **orchestrator/user** when:

- acceptance criteria are materially ambiguous;
- a consequential product/UX/architecture decision is missing;
- the worker would need to broaden scope to succeed;
- two workers surface incompatible assumptions;
- the next action changes an approved contract.

A worker should not silently solve those by spending more tokens.

## Minimal worker input contract

The handoff should be a compact execution contract, not a miniature repository dump.

Required fields:

### 1. Objective

One outcome sentence.

Example shape:

    Objective: make X behavior satisfy Y outcome.

### 2. Repository state and ownership

Only what the worker needs to establish its starting point:

    Repository: owner/repo
    Base/work-item ref: exact branch or commit when relevant
    Owned change surface: paths/modules/behavioral boundary
    Read first: exact project-rule files and bounded design/source references

Use stable references whenever possible. Prefer path plus heading, symbol, issue/PR, commit, or bounded range over pasted content.

### 3. Scope and non-goals

State the worker's responsibility and the nearby things it must not redesign or modify.

Avoid a general “follow the whole PRD” instruction when only two acceptance statements matter.

### 4. Relevant constraints

Include only constraints that could change the worker's implementation or review.

Examples:

- dependency direction;
- required public interface;
- relevant engineering rule;
- approved UX behavior;
- compatibility/runtime floor;
- write/isolation restriction.

Reference the canonical document for the rest.

### 5. Acceptance criteria

Give observable criteria that let the worker decide it is done.

A worker should not receive unrelated work-item acceptance criteria.

### 6. Verification

Specify the minimum expected evidence:

- targeted tests/checks;
- build/type/lint command when applicable;
- exact behavior to exercise;
- when full verification is intentionally delegated elsewhere.

### 7. Stop/escalate conditions

Short conditions that tell the worker not to invent a decision:

- required canonical artifact contradicts the task;
- necessary decision is absent;
- owned scope must expand;
- isolation assumption is false;
- verification cannot run.

### 8. Output contract

Tell the worker to return only the compact evidence described below.

## What must not be copied into worker input

By default, do not paste:

- a whole PRD;
- the whole engineering document;
- the entire work-item artifact;
- long repository history;
- full PR discussion;
- previous worker transcripts;
- complete test logs;
- full diffs the worker can inspect directly;
- broad “context” summaries that duplicate persisted sources.

Exceptions require a reason: the source is unavailable to the worker, a small ephemeral user decision has not yet been persisted, or a runtime limitation makes the reference inaccessible.

When an exception is needed, pass only the relevant slice.

## Minimal worker output contract

The worker result should be optimized for orchestration and review, not for narrating its process.

Recommended fields:

### Status

One of:

- completed;
- blocked;
- needs-escalation.

### Delivered

A terse description of changed behavior or the conclusion reached.

For writers, include the meaningful paths/surface changed. Do not repeat every touched line.

### Verification

Commands/checks performed and their outcome. Include only actionable failure excerpts, not raw logs.

### Material decisions or deviations

Only choices that the orchestrator/reviewer may need to understand later.

If the worker followed the requested approach without deviation, say none.

### Blockers/residual risk

Only unresolved items that can affect integration or acceptance.

### Durable handoff reference

When relevant: commit, branch, worktree/session, artifact path, or finding IDs.

Do not restate the prompt, summarize routine exploration, paste the whole diff, or produce a diary of tool calls.

## Token-efficient context strategy

### Default: fresh worker plus references

This should be Flow's normal worker shape because it:

- keeps irrelevant orchestration history out of worker input;
- encourages task cohesion;
- makes missed-context findings diagnosable;
- keeps model routing independent from orchestrator context size;
- makes the handoff portable across Claude Code and Codex.

The worker reads the exact repository slices it needs.

### Use a bounded parent-context fork only when it beats reconstruction

A fork can be efficient when the task depends on a dense set of recent decisions that would otherwise need a large copied summary.

Runtime-specific guidance:

- Claude Code: use a fork only when full parent context is justified; vendor docs note prompt-cache reuse can make this cheaper than rebuilding the same context in a fresh agent.
- Codex: when the active runtime exposes fork_turns, prefer none or the smallest recent-turn window that contains the needed ephemeral state. Treat this as an adaptive capability, not a universal contract.

### Persist decisions before scaling worker fan-out

If several workers all need the same consequential decision, persist it once in the canonical repository artifact and hand out the reference. Repeating the same decision block in N worker prompts multiplies token cost and creates stale-copy risk.

### Summaries are lossy boundaries

A worker summary is suitable for:

- result;
- evidence;
- deviations;
- risk.

It is not a substitute for the source of truth. The orchestrator should reference changed files, commits, test evidence, and canonical artifacts during review rather than trusting a prose summary as the implementation record.

## Parallelization heuristics

Flow should keep one active work item as the normal delivery baseline and parallelize inside it only when useful.

### Strong candidates for parallel execution

Parallelize when responsibilities are independent in both reasoning and mutation.

Examples:

- multiple read-only repository investigations;
- separate review lenses;
- test/log analysis independent of implementation;
- independent implementation slices with distinct ownership and files;
- documentation plus isolated code work when neither depends on the other's output.

Read-only workers have a lower coordination threshold because they cannot create merge conflicts.

### Serialize when any of these are true

- one task consumes another worker's output;
- two writers likely touch the same files or symbols;
- both workers modify shared manifests, schemas, migrations, app composition, routing, global configuration, or central generated artifacts;
- the workers need to negotiate one architecture decision;
- verification depends on integrated intermediate state;
- the runtime cannot guarantee separate write workspaces and collision cost is material;
- the task is so cohesive that decomposition would duplicate exploration and context.

### Concurrency selection

Do not encode “one worker per task” or a fixed worker count.

A useful decision sequence is:

1. identify meaningful responsibilities;
2. group responsibilities that share context/change surface;
3. find truly independent groups;
4. estimate context duplication and integration cost;
5. check runtime isolation;
6. spawn only the groups whose parallel elapsed-time saving exceeds coordination cost.

Runtime concurrency limits are ceilings. They are not recommended fan-out.

### Writer isolation policy

**Claude Code**

Parallel writers may use per-subagent worktrees when:

- each worker has a clearly owned slice;
- the worktree starts from the exact required work-item state;
- integration owner is explicit.

Use worktree.baseRef = head or another exact branch/worktree strategy when workers need current feature-branch commits instead of default-branch state.

**Codex**

Do not assume spawned children have separate checkouts.

For write-heavy parallelism:

- prefer one writer plus parallel read-only helpers;
- or serialize writers;
- or run independent top-level Codex chats/sessions in separate managed/manual worktrees and let the orchestrator integrate them.

A prose instruction to use another directory is not equivalent to runtime-enforced isolation.

## Review-history metrics for cost/quality tuning

The work-item review history should be the empirical source for worker routing decisions.

Record enough metadata per delegated responsibility to answer why a run was cheap, expensive, accepted, or repaired.

### Per-run dimensions

- runtime;
- runtime version/build;
- client surface;
- worker role;
- task shape/category;
- read-only or writer;
- isolation mode;
- model;
- reasoning effort;
- context mode: fresh, forked, bounded fork, runtime-owned;
- handoff input tokens when exposed, otherwise approximate prompt size;
- worker output tokens when exposed, otherwise approximate output size;
- elapsed duration;
- verification attempted/passed;
- review disposition;
- repair count;
- escalation count.

### Classify review findings by cause

At minimum:

**missing_context**

The worker could reasonably have succeeded if a relevant rule/decision/reference had been supplied.

**worker_quality**

The required context was available, but the implementation/reasoning was wrong or incomplete.

**integration_conflict**

The local worker result was reasonable but collided with another worker/shared surface.

**scope_leak**

The worker changed or reasoned beyond its ownership boundary.

**verification_gap**

The worker did not produce the verification evidence the contract required.

**orchestration_error**

The task should not have been delegated, decomposed, or parallelized in that shape.

This classification matters more than a raw “review failed” count because each cause calls for a different fix.

### Derived metrics

| Metric                          | Why it matters                                                      | Typical tuning response                                              |
| ------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| First-pass acceptance rate      | Shows whether a model/effort tier is capable for a task class.      | Low rate with adequate context -> stronger model/effort.             |
| Missing-context finding rate    | Detects handoff contracts that are too thin.                        | Add the missing reference/field only; do not bulk-copy docs.         |
| Repair/retry rate               | Measures hidden total cost beyond the first worker call.            | Compare quality-adjusted cost across tiers.                          |
| Repair token ratio              | Shows when a cheap first pass becomes more expensive after repairs. | Raise baseline tier for that role if persistent.                     |
| Escalation rate                 | Tests whether initial routing is realistic.                         | Frequent immediate escalation -> start one tier higher.              |
| Scope-leak rate                 | Indicates weak ownership/non-goals or model discipline.             | Tighten scope contract before raising model.                         |
| Verification-gap rate           | Detects weak output/acceptance contracts.                           | Make expected evidence explicit.                                     |
| Parallel conflict rate          | Measures unsafe write concurrency.                                  | Reduce writer fan-out or require isolation.                          |
| Context-input size              | Detects handoffs becoming mini-PRDs.                                | Replace copied text with canonical references.                       |
| Output size per accepted result | Detects verbose workers with little extra value.                    | Tighten output contract.                                             |
| Time-to-accepted                | Captures real latency including review and repair.                  | Optimize fan-out/model based on end-to-end time, not first response. |
| Human intervention rate         | Detects autonomy limits not visible in tests.                       | Raise orchestrator checkpoint frequency or worker tier.              |

### Quality-adjusted cost

When token/cost telemetry is available, compare:

    total worker input
    + total worker output
    + repair/retry tokens
    + reviewer tokens attributable to preventable worker defects

against accepted responsibilities, not merely against worker calls.

The cheapest first call is not economical if it repeatedly creates a second implementation pass and a larger review pass.

When token telemetry is unavailable, use elapsed time, retry count, output size, and review findings as proxies.

### Initial adaptation rule

Avoid overfitting tiny samples.

A practical starting policy:

- do not promote or demote a role/model baseline from one unusual failure;
- after repeated worker_quality findings on comparable tasks with adequate handoffs, move that class one capability/effort tier up;
- after a meaningful clean sample with high first-pass acceptance and no quality-related repair, trial one tier cheaper on low-risk examples;
- if missing_context findings rise, fix the handoff contract rather than escalating the model;
- if integration_conflict rises, change decomposition/isolation rather than escalating reasoning.

The exact numeric thresholds should be tuned from Flow's own evidence rather than embedded as permanent product truth.

## Recommended Flow routing algorithm

For each ready responsibility:

### Step 1: decide whether delegation is worthwhile

Keep the work in the orchestrator when the change is genuinely tiny, depends on frequent user interaction, or is inseparable from current integration reasoning.

Otherwise prefer a fresh worker for non-simple implementation or bounded review/research.

### Step 2: classify the responsibility

Capture:

- read-only vs writer;
- ambiguity;
- architectural consequence;
- verification strength;
- likely change surface;
- dependencies on sibling work;
- risk of wrong implementation.

### Step 3: query runtime capabilities

Determine the actual version/surface and available:

- worker model override;
- effort override;
- context mode;
- workspace isolation;
- concurrency.

Do not infer these from “Claude” or “Codex” alone.

### Step 4: choose the cheapest historically capable tier

Start with the lowest model/effort combination whose review history is adequate for this role/task shape.

If there is no local evidence yet:

- economical tier for narrow read/search/test/mechanical work;
- standard tier for coherent implementation;
- high tier for ambiguity/high consequence.

### Step 5: build the minimum handoff

Pass objective, exact references, scope/non-goals, relevant constraints, acceptance criteria, verification, stop conditions, and the compact output contract.

Use repository references instead of document copies.

### Step 6: choose context mode

Default to fresh/minimal.

Use bounded/full fork only when the worker genuinely needs parent-only context and reconstructing it would be more expensive or lossy.

### Step 7: decide concurrency

Parallelize only independent groups.

For writers, require safe disjoint ownership and runtime-enforced isolation when collision risk is meaningful. Otherwise serialize.

### Step 8: integrate and review

The orchestrator reviews evidence and the actual repository result, not only the worker summary.

Attribute any finding to missing context, worker quality, integration, scope, verification, or orchestration.

### Step 9: feed history back into routing

Update the empirical baseline for the role/runtime/model/effort/task-shape combination.

## Major limitations and runtime-specific uncertainties

### Claude Code

1. **Version semantics changed materially through 2.1.x.**
   Model precedence, resume behavior, nesting defaults, worktree checks, fork commands/defaults, and several subagent fields have explicit minimum versions. Flow must record/check version rather than rely on old local knowledge.

2. **Effort is not the same as extended-thinking enablement.**
   Subagent effort is configurable, but current docs say the extended-thinking on/off state itself is inherited from the session.

3. **Worktree default base can be wrong for an in-progress work item.**
   Fresh worktrees use the default branch unless worktree.baseRef is head or the worktree is otherwise created from the desired state.

4. **Fresh workers still load project instructions unless configured otherwise.**
   This is normally desirable, but it means the true input cost is more than the visible delegation prompt.

5. **Forks are efficient only when inherited context is actually useful.**
   Prompt-cache reuse can lower cost, but irrelevant context still increases cognitive/context load.

### Codex

1. **Public product capability and live spawn schema are not identical.**
   Model/effort routing is documented, yet current MultiAgentV2 source can hide model and reasoning_effort fields from spawn_agent depending on configuration.

2. **Input-context semantics vary by multi-agent implementation/configuration.**
   Current V2 source supports none/all/last-N turn propagation and currently defaults omitted fork_turns to all. This is not yet presented as a stable end-user contract in the public Subagents page.

3. **Per-subagent worktree/cwd is not a current stable primitive.**
   Managed worktrees isolate chats, not individual spawn_agent children. Current SpawnAgentArgs has no cwd/worktree field.

4. **Backend defaults are intentionally not a Flow contract.**
   Current source contains different V1/V2 concurrency/depth behavior. Public docs leave the default concurrent-thread cap runtime-owned when unset.

5. **Surface behavior can differ.**
   App, CLI, IDE, non-interactive execution, and ChatGPT Work do not expose identical controls or approval behavior. Flow should log surface as part of runtime evidence.

6. **Open-source main can be ahead of installed releases.**
   Source-level findings such as V2 fork_turns and schema gating are evidence of current implementation direction, not proof that every installed Codex version exposes them.

## Recommended Flow decisions

### Adopt

- capability-based runtime adapter;
- cheapest-capable worker routing;
- model and effort as separate decisions;
- fresh/reference-based handoff as default;
- compact structured worker result;
- one active work item baseline;
- dynamic intra-work-item parallelism;
- stronger preference for parallel read-only workers;
- runtime-enforced isolation for conflicting parallel writers;
- review-history feedback loop;
- graceful fallback to inherited parent model/effort.

### Do not adopt

- fixed worker count;
- fixed one-agent-per-task mapping;
- hard-coded runtime concurrency maximum as desired concurrency;
- hard-coded model names without availability detection;
- copying whole PRDs/engineering/work-items into worker prompts;
- assuming separate worker thread means fresh input context;
- assuming Codex spawned workers have separate worktrees;
- using stronger models to compensate for a missing handoff reference;
- using extra context to compensate for bad decomposition;
- using cheap workers where review history already shows negative total economics.

## Evidence and sources

All sources below are first-party vendor documentation or the official OpenAI Codex repository. Product docs were checked on 2026-10-01 local time.

### Claude Code

1. Anthropic, **Create custom subagents**  
   https://code.claude.com/docs/en/sub-agents

   Relevant evidence:
   - separate context windows and summary return;
   - cost control with cheaper models;
   - model resolution order;
   - effort frontmatter;
   - fresh-context startup contents;
   - parallel research guidance;
   - concurrency and nested-agent limits;
   - fork semantics and prompt-cache reuse;
   - version-specific behavior.

2. Anthropic, **Run parallel sessions with worktrees**  
   https://code.claude.com/docs/en/worktrees

   Relevant evidence:
   - session worktrees;
   - per-subagent isolation: worktree;
   - isolation enforcement;
   - cleanup;
   - worktree.baseRef fresh/head behavior;
   - parallel-session guidance.

### OpenAI Codex

3. OpenAI, **Subagents**  
   https://learn.chatgpt.com/docs/agent-configuration/subagents?surface=app

   Relevant evidence:
   - current Codex subagent availability;
   - parallel use cases;
   - context-pollution rationale;
   - model and model_reasoning_effort selection;
   - inheritance rules;
   - [agents] configuration;
   - approval/sandbox inheritance;
   - warnings around write-heavy parallelism.

4. OpenAI, **Worktrees**  
   https://learn.chatgpt.com/docs/environments/git-worktrees

   Relevant evidence:
   - Codex-managed chat worktrees;
   - selected starting branch;
   - per-chat worktree persistence/handoff;
   - difference between Local and Worktree execution.

5. OpenAI Codex source, **MultiAgentV2 spawn implementation**  
   Evidence observed from official openai/codex main during research; repository main was 8d44977aa2fb9ae1b128660668dc5b36966613fa at the final source check.  
   https://github.com/openai/codex/blob/8d44977aa2fb9ae1b128660668dc5b36966613fa/codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs

   Relevant evidence:
   - SpawnAgentArgs model and reasoning_effort;
   - fork_turns none/all/positive integer;
   - omitted fork_turns currently resolving to all;
   - no cwd/worktree spawn argument.

6. OpenAI Codex source, **multi-agent tool schema**  
   https://github.com/openai/codex/blob/8d44977aa2fb9ae1b128660668dc5b36966613fa/codex-rs/core/src/tools/handlers/multi_agents_spec.rs

   Relevant evidence:
   - spawn model/reasoning fields can be removed when expose_spawn_agent_model_overrides is false;
   - inherited-model guidance;
   - schema-level capability variance.

7. OpenAI Codex source, **configuration**  
   https://github.com/openai/codex/blob/8d44977aa2fb9ae1b128660668dc5b36966613fa/codex-rs/core/src/config/mod.rs

   Relevant evidence:
   - multi-agent V1/V2 defaults exist separately;
   - internal defaults are implementation details rather than stable Flow policy.

8. OpenAI Codex source, **multi-agent model messages**  
   https://github.com/openai/codex/blob/8d44977aa2fb9ae1b128660668dc5b36966613fa/codex-rs/prompts/src/model_messages/multi_agent.rs

   Relevant evidence:
   - parent can control propagated context with fork_turns in current V2 implementation;
   - nested agents and team messaging exist in current implementation.

9. OpenAI Codex issue tracker, **Support cwd for spawn_agent #18969**  
   https://github.com/openai/codex/issues/18969

   Use only as corroborating uncertainty evidence:
   - the enhancement request describes current spawned-agent cwd limitations;
   - it is not a roadmap commitment and does not override product documentation or source.

## Final recommendation

Flow vNext should encode a strong orchestration baseline but keep the execution mechanism adaptive.

The durable rule is not “use Haiku for X” or “spawn four agents.” It is:

> Give a bounded responsibility to the cheapest model/effort combination that has demonstrated adequate first-pass quality, with the smallest sufficient context, and parallelize only when dependency and isolation economics are favorable.

Runtime-specific features then improve that baseline:

- Claude Code can use fresh workers, explicit model/effort routing, forks when cache reuse is worthwhile, and first-class per-worker worktrees.
- Codex can use explicit/configured model and reasoning routing, parallel agent threads, and current V2 context-fork controls when exposed, while treating per-worker workspace isolation as unavailable unless a future runtime capability explicitly proves otherwise.

That keeps Flow runtime-agnostic without reducing all runtimes to the least capable feature set.
