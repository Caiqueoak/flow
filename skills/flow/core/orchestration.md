# Orchestration

Use this guidance whenever Flow routes implementation work. The orchestrator owns user interaction, synthesis, integration judgment, architectural consistency and final review. Implementation delegation is proportional to the work, but mandatory for non-simple implementation.

## Resolve runtime capabilities first

Build an in-memory capability profile from what the active runtime actually exposes. Do not branch policy on vendor, product, agent, or model names.

Record only capabilities that are observable now:

- `spawnWorkers`: a child worker/subagent mechanism can be launched;
- `workerModelOverride`: a worker model can be selected;
- `workerEffortOverride`: worker reasoning effort can be selected;
- `contextModes`: fresh, parent, or bounded context modes actually exposed;
- `workspaceIsolation`: none, session, or per-worker isolation actually guaranteed;
- `concurrency`: runtime-reported/configured concurrent-worker ceiling when known;
- `usageTelemetry`: token/cache/cost data actually exposed;
- `runtimeVersion`: runtime/build evidence when available;
- `surface`: CLI, app, IDE, non-interactive, or equivalent execution surface.

Never invent capability facts, worker ceilings, telemetry, isolation, or model choices.

Capability fallback is explicit:

- no worker mechanism: genuinely simple and bounded implementation may proceed directly; non-simple implementation must block/defer and surface the capability limitation. Never silently implement non-simple work directly;
- no model override: inherit the runtime model;
- no effort override: inherit/default effort;
- no context control: send the self-sufficient minimum handoff below and accept runtime-owned context behavior;
- no safe workspace isolation: do not run conflicting writers concurrently;
- no usage telemetry: tune from review history, retries, verification results, and output size.

An explicit external worker mechanism may satisfy delegation when the active runtime cannot spawn workers itself. Flow does not add a vendor-specific launcher.

## Decide whether direct implementation is allowed

Direct implementation is allowed only when the change is genuinely simple and bounded: one cohesive responsibility, small/obvious change surface, no material decomposition benefit, low integration risk, and no consequential ambiguity.

If those conditions do not clearly hold, treat the implementation as non-simple and delegate it. Do not downgrade work to "simple" merely because no worker is available.

Ordinary orchestrator responsibilities are not worker implementation: understanding user intent, selecting scope, preparing handoffs, integrating worker results, resolving repository-level conflicts, reviewing evidence, and returning consequential product/experience/engineering ambiguity to the user.

## Build minimum-sufficient worker input

Every delegated responsibility contains only:

1. Objective — one observable outcome sentence.
2. Repository state — exact repository plus work-item/task state and exact branch/commit when relevant.
3. Ownership — task/work-item ID and owned change surface.
4. Read-first references — exact paths, headings, symbols, or durable references required before editing.
5. Scope/non-goals — what may and may not change.
6. Relevant constraints — only constraints that can change implementation.
7. Acceptance criteria — only criteria owned by this responsibility.
8. Verification — minimum expected checks/evidence.
9. Stop/escalate conditions — missing decision, scope expansion, contract contradiction, isolation failure, or unverifiable result.
10. Output contract — the compact result below.

Prefer repository references over copying whole contracts, history, or unrelated context. Copy only a bounded slice the worker cannot otherwise access.

## Require compact worker output

Require exactly the information needed to integrate and review:

- `status`: `completed | blocked | needs_escalation`;
- `delivered`: terse changed behavior/result and meaningful surface;
- `verification`: checks plus outcomes/evidence;
- `material decisions/deviations`: `none` when none;
- `blockers/residual risk`;
- `durable handoff reference`: commit, branch, workspace, artifact, or finding IDs when relevant.

Do not ask for the prompt echoed back, tool diaries, whole diffs, whole logs, or repository recaps.

## Route model and effort by evidence

Choose the cheapest historically capable runtime-resolved option for the bounded responsibility. Never encode model identifiers or fixed effort tiers in Flow.

Use W5 review history plus current verification/retry evidence to classify failures before changing routing:

| Cause | Response |
| --- | --- |
| `missing_context` | add the missing reference/slice; do not raise model/effort first |
| `worker_quality` | retry/repair; raise model or effort only when evidence supports insufficiency |
| `integration_conflict` | serialize, repartition, or improve isolation |
| `scope_leak` | tighten ownership and non-goals |
| `verification_gap` | strengthen expected checks/evidence |
| `orchestration_error` | change delegation, decomposition, or parallelism |

One unusual failure does not permanently change the routing baseline.

A consequential product, experience, public-contract, architecture, security, irreversible-operation, or scope ambiguity returns to the user through the decision flow. A stronger worker is not a substitute for missing human authorization.

## Choose parallelism only when worthwhile and safe

Reuse W4 structural safety. The skill decides whether concurrency is worth its context/integration cost; there is no fixed worker count and no one-worker-per-task rule.

Before parallelizing, consider semantic dependency, ownership, likely change-surface overlap, shared mutable resources, integration cost, verification needs, and whether concurrency materially reduces elapsed work.

- Never start unsafe concurrent writers.
- If isolation is unavailable, serialize any writers whose safety cannot be established in the shared workspace.
- Worktrees are optional execution mechanisms, never a requirement.
- One cohesive work item may be best owned by one worker even when it has several tasks.
- Separate workers may be useful for genuinely independent responsibilities, including bounded read-only analysis, when their outputs integrate cleanly.

The work-item branch remains the integration authority. The orchestrator integrates deliberately and verifies the integrated state, not only worker-local results.

## Recover and tune from durable evidence

On resume, reconstruct delegation from repository/Git/Flow state and durable worker handoff references; never depend on hidden chat context. If a worker result is missing, ambiguous, or unverifiable, classify the cause and retry/repair rather than inventing completion evidence.

Use W5 review passes/findings/resolutions as empirical feedback for handoff size, ownership boundaries, verification requirements, model/effort routing, and parallelism. Preserve the review history; tune future handoffs without rewriting past evidence.
