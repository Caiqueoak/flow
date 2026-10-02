# Flow vNext Evaluation Strategy

## Purpose

Define a repeatable evaluation program for determining whether Flow vNext improves:

- discovery quality;
- resumability across fresh chats;
- orchestration and delegation quality;
- review effectiveness;
- repair quality;
- work-item review history;
- token and cost efficiency.

The evaluation must compare observable outcomes, not whether an agent followed a preferred internal reasoning process. It must also separate Flow quality from model/runtime capability by running matched scenarios across configurations where practical.

This document defines benchmarks and measurement only. It does not redesign Flow architecture, specify runtime/subagent capabilities, research BMAD, or audit current state/recovery implementation gaps.

## Grounding

The vNext backlog defines the intended behavioral direction:

- discovery keeps relevant dimensions explicitly resolved, unresolved, or deferred/not relevant and must not finalize scope while relevant dimensions remain unresolved;
- decision-heavy phases are resumable from repository state;
- non-simple implementation is delegated, with the orchestrator retaining synthesis and review responsibility;
- parallelism is selected dynamically from dependency and change-surface evidence rather than a fixed worker count;
- worker handoffs should contain the minimum sufficient context;
- review should produce a human-readable parecer and append-only finding history;
- cheaper workers should be used when they demonstrate sufficient quality, with escalation when evidence shows they are insufficient.

The original Flowboard POC is useful historical evidence but not a complete benchmark baseline. Its work-item review files such as `_flow/work-items/W001-application-foundation/review.yaml` through `W004` record only approval status and time. They therefore cannot retrospectively measure defect recall, false positives, repair churn, handoff omissions, or review-history quality. Future benchmark runs must capture those observables explicitly.

## Evaluation principles

1. **Paired comparison first.** Compare current Flow and Flow vNext on the same repository fixture, task, scripted user answers, model, runtime, and tool availability whenever possible.
2. **Outcome over ceremony.** Score user-visible correctness, preserved decisions, safe continuation, defect detection, and efficient context transfer. Do not award points merely for extra steps or artifacts.
3. **Fixed fixtures, hidden evaluator truth.** Each benchmark should have an evaluator-only manifest describing required decisions, seeded constraints, intended conflict surfaces, and seeded defects. The agent under test must not see the expected answer.
4. **Hard invariants plus graded quality.** Some failures are categorical, such as finalizing discovery with a required unresolved decision or approving a seeded blocking defect. Other dimensions, such as question quality or handoff concision, require scored rubrics.
5. **Measure successful outcomes.** Token/cost efficiency is meaningful only at comparable quality. A cheaper run that fails acceptance is not more efficient.
6. **Repeat stochastic runs.** For model-driven scenarios, use repeated runs and report distributions rather than a single anecdote.
7. **Do not hide interventions.** User corrections, evaluator resets, manual context injection, and reruns are part of the result and must be counted.

## Run protocol

Each benchmark run should record a small run manifest:

- benchmark ID and fixture revision;
- Flow version/commit;
- model and runtime identifiers as exposed by the environment;
- reasoning/configuration identifiers when exposed;
- start and end repository revisions;
- user-answer script revision, where applicable;
- worker/orchestrator boundaries;
- review passes and repair attempts;
- deterministic gate results;
- token, billed usage, or cost telemetry when exposed;
- evaluator verdict and rubric notes.

For model-driven benchmarks, use at least three repeated runs per matched configuration before drawing conclusions. Five runs are preferable for high-variance scenarios such as discovery and orchestration. Report median values and the full pass count; use p90 only when the sample is large enough to make it meaningful.

When comparing current Flow against vNext, randomize or alternate execution order where practical so that evaluator learning or fixture handling does not consistently favor one version.

## Benchmark suite

### B01 — Discovery with unresolved decisions

**Purpose:** verify that discovery does not silently lose material open questions or convert assumptions into accepted scope.

**Fixture:** a greenfield or brownfield product brief with 5–8 evaluator-labeled relevant dimensions. At least:

- two can be answered independently in one batch;
- one depends on an earlier answer;
- one has a plausible but unsafe/default assumption;
- one can legitimately be deferred or marked not relevant.

**Script:** provide only partial answers, deliberately leaving one consequential dimension unresolved.

**Expected observable behavior:**

- prior answers remain consistent across later questioning;
- the next question set is derived from prior answers;
- unresolved relevant dimensions remain visible in persisted state;
- assumptions are not silently promoted to decisions;
- scope/PRD finalization does not occur while the required unresolved dimension remains open;
- explicitly deferred/not-relevant items are distinguished from unresolved items.

**Hard pass/fail:**

- fail if final scope/PRD is presented as approved/final while any evaluator-required relevant dimension remains unresolved;
- fail if the agent contradicts an already supplied consequential answer;
- fail if the unsafe seeded assumption is adopted without user decision.

**Metrics:**

- required-dimension tracking recall = tracked required dimensions / evaluator-required dimensions;
- consequential assumption escape count;
- repeated-question rate = questions whose answer was already available / total questions;
- unnecessary-question rate, human-reviewed;
- question dependency errors, where a dependent question is asked before prerequisite information exists.

**Proposed acceptance threshold:**

- 100% of consequential required dimensions tracked;
- 0 consequential assumption escapes;
- 0 premature finalizations;
- repeated-question rate <= 10%.

### B02 — Fresh-chat resume during discovery

**Purpose:** measure whether repository state is sufficient to resume without hidden chat context.

**Fixture:** reuse B01, but stop after a meaningful decision batch while at least two dimensions remain unresolved.

**Procedure:**

1. end the original chat after the checkpoint is persisted;
2. start a fresh orchestrator chat with no transcript from the prior chat;
3. ask Flow to continue.

**Expected observable behavior:**

- previously made decisions are recovered accurately;
- unresolved/deferred state is distinguished correctly;
- the agent resumes at the next decision frontier rather than restarting discovery;
- already answered questions are not unnecessarily repeated;
- no decision is invented from missing chat context.

**Hard pass/fail:**

- fail on any contradiction of a consequential persisted decision;
- fail if continuation requires the evaluator to manually restate prior answers;
- fail if a consequential unresolved decision is treated as resolved.

**Metrics:**

- consequential decision recovery accuracy;
- unresolved-set recovery precision/recall;
- resume replay rate = repeated already-answered questions / previously answered questions;
- manual context reinjection count;
- time/tokens to first useful resumed action, if telemetry allows.

**Proposed acceptance threshold:**

- 100% consequential decision recovery;
- 100% consequential unresolved-item recovery;
- 0 manual context reinjections;
- resume replay rate <= 10%.

### B03 — UX or engineering draft resume

**Purpose:** verify resumability in another decision-heavy phase without making discovery the only tested case.

**Fixture:** a bounded feature requiring either experience/UX decisions or an engineering definition with 4–6 evaluator-labeled decisions. Stop after half are resolved.

**Expected observable behavior:**

- the draft remains distinguishable from approved/final artifacts;
- fresh-chat continuation recovers accepted directions and open decisions;
- no approval is inferred from partial progress;
- continuation starts from the next unresolved design decision.

**Hard pass/fail:**

- fail if an incomplete draft is treated as approved;
- fail if an approved prior decision is lost or contradicted.

**Metrics:**

- decision recovery accuracy;
- unresolved-decision recall;
- duplicate discussion rate;
- human score for whether the resumed next action is appropriate.

**Proposed acceptance threshold:**

- 100% consequential decision recovery;
- 0 false approvals.

### B04 — Non-simple implementation delegation

**Purpose:** verify that non-simple implementation is delegated while trivial work is not artificially fragmented.

**Fixture:** prepare two tasks against the same small repository:

- **B04-A:** a truly simple, bounded one-file change;
- **B04-B:** a non-simple work item with multiple meaningful implementation responsibilities and non-trivial verification.

**Expected observable behavior:**

- B04-A may be handled directly if that is proportional;
- B04-B delegates meaningful implementation responsibility to at least one fresh worker;
- the orchestrator retains integration/review judgment;
- tasks are not decomposed into meaningless micro-work solely to create workers.

**Metrics:**

- delegation decision matches evaluator rubric;
- worker responsibility cohesion score, human-reviewed;
- worker count;
- orchestration overhead tokens;
- accepted outcome rate.

**Proposed acceptance threshold:**

- > = 90% rubric match across repeated fixtures;
- 0 cases where B04-B is entirely implemented by the orchestrator without a documented fixture-specific reason;
- no quality gain is claimed from higher worker count alone.

### B05 — Parallel versus sequential worker selection

**Purpose:** test whether Flow distinguishes genuinely independent responsibilities from conflicting change surfaces.

**Fixture pair:**

- **B05-A independent:** two meaningful tasks with separate owned modules/files, no shared mutable configuration, and independent verification;
- **B05-B conflict:** superficially parallel tasks that both touch a shared manifest, routing/composition file, schema, migration, or equivalent integration hotspot.

**Expected observable behavior:**

- B05-A may run in parallel when the runtime supports it;
- B05-B is serialized or given a clear single integration owner;
- the decision is proportional to expected elapsed-time benefit and integration risk.

**Hard pass/fail:**

- fail if B05-B launches conflicting writers concurrently without an explicit isolation/integration strategy;
- fail if dependency-sensitive work is run concurrently in a way that creates avoidable merge/integration defects.

**Metrics:**

- safe-parallelization decision accuracy;
- unsafe concurrent-writer count;
- avoidable merge/integration conflict count;
- elapsed time when runtime telemetry makes it reliable;
- coordination tokens.

**Proposed acceptance threshold:**

- 0 unsafe parallel-writer decisions in known-conflict fixtures;
- > = 90% evaluator-rubric match across independent/conflict fixture pairs.

### B06 — Worker receives a relevant project constraint

**Purpose:** test the minimum-sufficient handoff contract.

**Fixture:** a work item whose acceptance criteria are simple but whose correct implementation also depends on one relevant project rule stored elsewhere, for example a naming, ownership, dependency-direction, accessibility, or persistence constraint. The constraint must be material but not repeated verbatim in the task.

**Expected observable behavior:**

- the handoff either includes the relevant bounded constraint or a precise reference the worker actually uses;
- unrelated PRD/engineering/history content is not copied wholesale;
- implementation satisfies the hidden evaluator-labeled project constraint.

**Hard pass/fail:**

- fail if the final implementation violates the seeded relevant constraint;
- fail if success requires the evaluator to inject missing project context manually.

**Metrics:**

- relevant-constraint coverage;
- handoff input tokens;
- irrelevant-context ratio, based on evaluator annotation;
- worker exploration tokens/tool calls when exposed;
- review findings attributable to missing handoff context.

**Proposed acceptance threshold:**

- 100% consequential seeded constraints satisfied;
- 0 manual context injections;
- vNext should reduce median handoff input tokens versus the matched current-Flow baseline without lowering pass rate.

### B07 — Review detects seeded implementation defects

**Purpose:** measure review effectiveness independently from implementation generation.

**Fixture:** provide a completed work-item branch containing a controlled defect set unknown to the reviewer. Include a mix such as:

- one blocking acceptance defect;
- one engineering-contract violation;
- one edge-case/regression defect;
- one plausible non-defect that could attract an overzealous reviewer.

Each seeded issue has evaluator severity and expected evidence.

**Expected observable behavior:**

- review checks the delivered outcome against acceptance, engineering constraints, edge cases, verification, and traceability;
- findings are concrete and evidence-backed;
- blocking defects prevent approval;
- stylistic alternatives are not mislabeled as defects.

**Hard pass/fail:**

- fail if any seeded blocking defect is missed and the work item is approved;
- fail if the reviewer fabricates evidence for a finding.

**Metrics:**

- blocking defect recall;
- overall defect recall = true positive seeded defects found / total seeded defects;
- finding precision = true positive findings / all findings;
- severity agreement;
- evidence quality, human-reviewed;
- false blocker count.

**Proposed acceptance threshold:**

- 100% blocking defect recall;
- > = 90% overall seeded-defect recall;
- > = 80% finding precision;
- 0 fabricated-evidence findings.

### B08 — Repair after review

**Purpose:** verify that review findings drive effective repair rather than superficial status changes.

**Fixture:** start from B07 findings and execute repair.

**Expected observable behavior:**

- each blocking finding is resolved, explicitly accepted as residual risk by the appropriate authority, or remains open;
- repair is scoped to findings without erasing prior review history;
- verification is rerun where the repair can affect it;
- no new regression is introduced.

**Hard pass/fail:**

- fail if a blocking finding is marked resolved while its defect remains;
- fail if review history is rewritten to hide the original finding;
- fail if the repaired work item is approved with an unresolved blocking defect.

**Metrics:**

- first-repair-pass closure rate;
- reopened finding rate;
- repair regression rate;
- repair task count per original finding;
- repair tokens/cost;
- review-to-accepted-outcome total tokens.

**Proposed acceptance threshold:**

- 100% blocking findings genuinely closed before approval;
- > = 90% seeded findings closed on first repair pass;
- <= 5% repair-regression rate across the suite.

### B09 — Work-item review history quality

**Purpose:** determine whether the persisted review history is useful for later agents and humans.

**Fixture:** a work item with at least two review passes: initial changes-required, repair, and re-review.

**Expected observable behavior:**

The persisted history makes it possible to determine:

- what scope/evidence the reviewer inspected;
- what was delivered;
- what findings were raised;
- stable finding identity where needed;
- what repair was requested;
- how each finding was resolved or carried forward;
- final disposition and residual risk.

**Deterministic checks:**

- prior review pass still exists after later passes;
- statuses/dispositions use valid routing vocabulary;
- referenced work item/finding identifiers are internally consistent.

**Human rubric, 0–2 per item:**

1. delivered outcome is summarized clearly;
2. acceptance and engineering conformance are addressed;
3. findings are concrete and actionable;
4. evidence/verification is traceable;
5. resolution history is understandable;
6. residual risks/gaps are explicit.

Maximum score: 12.

**Proposed acceptance threshold:**

- all deterministic checks pass;
- median human rubric >= 10/12;
- no run scores 0 on finding actionability or resolution traceability.

### B10 — Model escalation after cheaper-worker failure

**Purpose:** evaluate the policy outcome without prescribing runtime mechanics.

**Fixture pair:**

- **B10-A:** bounded task that the cheaper configured worker completes correctly;
- **B10-B:** task designed so the first worker demonstrably fails acceptance or review despite a sufficient handoff.

**Expected observable behavior:**

- B10-A does not escalate unnecessarily;
- B10-B retries or escalates after evidence of insufficiency;
- escalation is tied to observed failure/ambiguity/risk rather than arbitrary preference;
- accepted output still goes through review.

**Metrics:**

- unnecessary escalation rate;
- successful escalation recovery rate;
- attempts before escalation;
- total tokens/cost to accepted outcome;
- quality after escalation.

**Proposed acceptance threshold:**

- 0 unnecessary escalation in the simple control fixture across the reference runs;
- > = 90% recovery after a clearly evidenced cheaper-worker failure;
- no acceptance-quality regression versus using the stronger configuration directly.

### B11 — Token-efficient handoffs

**Purpose:** measure whether vNext reduces context transfer without increasing missed constraints or repair churn.

**Fixture:** reuse B04, B06, and B10 so token efficiency is measured on real work rather than a synthetic prompt-compression task.

**Record when exposed:**

- orchestrator input/output tokens;
- each worker input/output tokens;
- review and repair tokens;
- cached tokens if separately reported;
- billed usage/cost;
- number and size of referenced files/slices;
- evaluator-labeled unnecessary context.

**Core metrics:**

- worker handoff input tokens per accepted responsibility;
- total tokens per accepted work item;
- review+repair token share;
- irrelevant-context ratio;
- tokens per seeded constraint successfully respected;
- billed cost per accepted work item when reliable.

**Comparison rule:**

A token reduction counts as an improvement only if the matched quality gates still pass. Report both:

1. raw token/cost delta;
2. quality-normalized delta among successful runs.

**Proposed acceptance threshold:**

- target >= 20% reduction in median worker handoff input tokens on matched successful runs;
- total tokens per accepted work item must not regress by more than 10% unless the quality improvement is material and explicitly reported;
- no decrease in consequential-constraint coverage or blocking-defect recall.

These are initial calibration targets, not permanent product guarantees. Adjust after enough real runs establish stable baselines.

### B12 — Recovery from stale or inconsistent repository state

**Purpose:** test safe behavior when persisted repository facts disagree, without turning this benchmark into an audit of current recovery implementation.

**Fixture:** evaluator prepares inconsistent state, for example an artifact claiming progress that conflicts with canonical Git/work-item facts, or a stale continuation pointer.

**Expected observable behavior:**

- inconsistency is detected before unsafe continuation;
- the agent does not silently choose the most convenient state;
- it identifies the conflicting evidence sufficiently for recovery;
- after the fixture-provided reconciliation path is applied, continuation resumes from the corrected state.

**Hard pass/fail:**

- fail if the agent performs an irreversible or acceptance-changing action based on known inconsistent state;
- fail if it silently overwrites one side of the conflict without surfacing the inconsistency.

**Metrics:**

- inconsistent-state detection rate;
- unsafe-action count before reconciliation;
- correct recovery-path selection, evaluator-scored;
- tokens/actions to reach a safe continuation point.

**Proposed acceptance threshold:**

- 100% detection for seeded consequential inconsistencies;
- 0 unsafe actions before reconciliation.

## Cross-cutting metrics

### Quality

- benchmark pass rate;
- hard-invariant failure count;
- seeded acceptance-constraint compliance;
- user intervention count;
- consequential assumption count;
- regression count;
- accepted outcome on first implementation/review cycle.

### Resumability

- consequential decision recovery accuracy;
- unresolved-item precision/recall;
- duplicate/replayed question rate;
- manual context reinjection count;
- resume-to-useful-action tokens.

### Orchestration

- delegation decision rubric match;
- safe parallelization rubric match;
- unsafe concurrent-writer count;
- worker responsibility cohesion;
- merge/integration conflict count;
- unnecessary escalation rate.

### Review-derived quality

Review history should be the primary empirical feedback loop for worker and handoff tuning. Aggregate at least:

- findings per work item by category;
- findings attributable to missing handoff context;
- findings attributable to implementation quality despite sufficient handoff;
- blocking vs non-blocking findings;
- false-positive findings;
- reopened findings;
- repair passes per work item;
- worker/model tier associated with each finding when known;
- repeated finding classes across work items;
- reviewer disagreement rate in human-scored benchmark runs.

A useful derived metric is:

`preventable_handoff_finding_rate = findings attributed to missing handoff context / all true-positive findings`

A rising rate suggests the minimum handoff contract is too thin. A falling rate combined with rising token use may indicate over-expansion and should be interpreted with the token metrics.

### Token and cost

When runtimes expose reliable telemetry, record:

- input, output, cached, and reasoning tokens using the runtime's own categories;
- per-worker and total run usage;
- billed cost if directly available;
- elapsed runtime if comparable.

Do not invent costs from token counts when pricing/configuration is unknown. If external pricing is used later, store the pricing snapshot/version with the evaluation result.

Primary comparisons:

- median worker input tokens per successful delegated responsibility;
- median total tokens per accepted work item;
- median review+repair tokens per accepted work item;
- cost per accepted work item;
- quality-adjusted cost, reported only among runs passing all hard gates.

## Regression signals

Treat the following as regressions even if overall completion rate looks good:

- discovery finalizes with unresolved consequential decisions;
- fresh-chat resume requires users to restate persisted decisions;
- already answered questions materially increase;
- orchestrator starts implementing non-simple work directly more often without justification;
- unsafe parallel writers increase;
- handoff tokens decrease while missing-constraint findings increase;
- cheaper-worker usage rises but repair/retry cost erases the savings;
- blocking review recall decreases;
- false blockers or stylistic findings increase;
- repair closes statuses without closing defects;
- review history becomes less traceable;
- total successful-run cost rises materially without a corresponding quality gain;
- stale-state scenarios continue through conflict instead of surfacing it.

## Deterministic versus human-reviewed evaluation

### Deterministic or mechanically checkable

Prefer deterministic checks for:

- repository/artifact existence and revision;
- whether a final artifact was produced while a fixture-labeled required decision remained unresolved;
- exact recovery of fixture-provided decision values;
- duplicate question detection when the same semantic question is deliberately repeated;
- whether workers were invoked and whether invocations overlapped;
- changed-file overlap in parallel-writer scenarios;
- deterministic gate results;
- seeded defect presence after repair;
- blocking finding unresolved at approval;
- append-only presence of prior review passes;
- token/cost telemetry reported by the runtime;
- unsafe mutation/action events in stale-state fixtures.

### Human-reviewed or rubric-scored

Use human review for:

- whether a discovery question was genuinely necessary;
- whether a dimension was relevant to the product;
- whether delegation granularity was coherent;
- whether parallelism was proportional rather than merely technically possible;
- whether a handoff contained irrelevant context;
- whether a review finding is a true defect rather than a stylistic preference;
- severity agreement;
- review evidence/actionability;
- appropriateness of a recovery path when multiple safe options exist.

For important comparative runs, use two independent scorers where practical. Resolve disagreement against the fixture specification rather than by averaging incompatible interpretations.

## Multi-model and multi-runtime testing

The purpose of the matrix is to distinguish Flow behavior from model/runtime behavior, not to rank models.

Run the same benchmark suite across:

- at least one lower-cost/less-capable worker configuration and one stronger configuration when both are available;
- each supported runtime family that is materially used with Flow;
- identical model/runtime configurations for current-Flow versus vNext comparisons.

Keep the fixture, user script, repository revision, and acceptance oracle identical across matched runs.

Report separately:

- Flow-version effect within the same model/runtime;
- model/configuration effect within the same Flow version;
- runtime effect when the same or comparable model configuration is available;
- interactions, such as vNext helping one tier more than another.

Do not treat unsupported telemetry as zero. Mark metrics as unavailable for that run.

## Baseline and acceptance decision

Use two baselines:

1. **Current Flow paired baseline:** the primary quantitative control for scenarios that can be rerun.
2. **Historical Flowboard POC:** qualitative/historical evidence only where equivalent telemetry does not exist.

A vNext release candidate should not be considered an evaluation success from one aggregate score. It should satisfy:

### Mandatory hard gates

- no premature finalization in unresolved-decision fixtures;
- no consequential decision loss on fresh-chat resume;
- no unsafe parallel-writer behavior in seeded conflict fixtures;
- 100% seeded blocking-defect recall before approval;
- no approval with unresolved seeded blocking findings;
- no unsafe continuation on seeded consequential repository inconsistency.

### Aggregate quality targets

Across repeated benchmark runs:

- > = 95% overall hard-pass rate;
- > = 90% overall seeded-defect recall and >= 80% finding precision;
- > = 90% first-pass repair closure for seeded findings;
- > = 90% orchestration decision rubric match;
- median review-history quality >= 10/12;
- no material increase in required user interventions versus the matched current-Flow baseline.

### Efficiency targets

Among successful matched runs:

- target >= 20% median reduction in worker handoff input tokens;
- total tokens per accepted work item no worse than 10% above baseline unless accompanied by a material, documented quality gain;
- cheaper-worker routing must reduce or preserve cost per accepted outcome after including retries, review, and repair.

The first complete benchmark cycle should be treated as calibration. Thresholds that are consistently too easy, impossible, or dominated by fixture artifacts should be revised explicitly with the rationale preserved.

## Recommended result format

For each benchmark/configuration, persist or export a row with:

- benchmark ID;
- Flow revision;
- model/runtime/config identifiers;
- repeat number;
- hard pass/fail;
- rubric scores;
- user interventions;
- delegation/parallelism decision;
- worker count;
- seeded defects found/missed;
- false findings;
- repair passes;
- input/output/total tokens when available;
- billed cost when available;
- evaluator notes.

A release comparison should summarize:

- pass counts by benchmark category;
- hard-gate failures;
- median quality metrics;
- median token/cost metrics for successful runs;
- regressions relative to current Flow;
- model/runtime-specific variance;
- unresolved evaluator limitations.

## Major limitations

- LLM behavior is stochastic; small run counts can overstate improvements.
- Human rubrics introduce evaluator judgment, especially for question necessity, delegation granularity, and review false positives.
- Seeded defects are controllable and measurable but may not represent the full distribution of real production defects.
- Token counts are not perfectly comparable across runtimes because tokenization, caching, reasoning accounting, and telemetry differ.
- Billed cost changes over time and may include pricing or cache effects outside Flow's control.
- Historical Flowboard artifacts lack rich review and token telemetry, so they cannot provide a complete quantitative before/after baseline.
- Parallel execution timing is sensitive to runtime scheduling and service latency; correctness and integration safety matter more than raw wall-clock speed.
- A benchmark can be gamed if fixture details leak into prompts. Evaluator-only manifests and hidden defect labels must remain outside the agent context.
- Stronger models can mask weak Flow guidance, while weaker models can expose it. Conclusions should therefore be reported per configuration as well as in aggregate.
- Passing these benchmarks does not prove correctness for every repository. The suite should evolve when real review history reveals recurring failure classes not represented here.

## Initial execution order

Start with the smallest high-signal core:

1. B01 discovery with unresolved decisions;
2. B02 fresh-chat discovery resume;
3. B05 parallel versus sequential selection;
4. B06 relevant-constraint handoff;
5. B07 seeded-defect review;
6. B08 repair after review;
7. B11 token-efficient handoffs;
8. B12 stale/inconsistent-state recovery.

Then add B03, B04, B09, and B10 to broaden phase coverage and model-selection evidence.

This order provides early evidence for the highest-risk vNext claims while keeping the first evaluation cycle bounded.
