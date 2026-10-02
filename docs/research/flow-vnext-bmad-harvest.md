# Flow vNext BMAD Mechanism Harvest

Research date: 2026-10-01 (America/Sao_Paulo)

## Baseline

This research is intentionally narrow. It evaluates BMAD mechanisms only for:

- discovery and elicitation;
- unresolved-decision tracking;
- incremental drafts/checkpoints and resume;
- challenge/forge validation;
- PRD create/update/validate;
- UX definition;
- architecture definition;
- handoffs and context recovery;
- review and re-review.

Flow was read at:

- `Caiqueoak/flow@47c3b45ea6d228636500636c92dbb1b7b755b8ae`
- `docs/backlog.md` at that exact revision
- the current Flow discovery, decision, recovery, specification, engineering, and review skills at that revision

BMAD was read from the current upstream repository state observed during this research:

- `bmad-code-org/BMAD-METHOD@1cbcfa272fe65787c06a1fa164a901f46117cca7`

The recommendation is not to copy BMAD's workflow wholesale. The useful part is the set of mechanisms that make long-running decision work durable, pressure-tested, independently reviewable, and recoverable from fresh context.

## Executive recommendation

Flow's current vNext direction is broadly reinforced by BMAD. Keep the adaptive discovery model, the dynamic unresolved-dimension gate, minimum-useful UX artifacts, `engineering.md` as the normative architecture/topology contract, repository-first recovery, and review history inside the work item.

The largest change suggested by the evidence is to refine the current draft-deletion rule.

BMAD's strongest mechanism is not a particular PRD or architecture template. It is its repository-local, append-only `.memlog.md`: decisions, assumptions, open questions, overrides, and direction are persisted **while the conversation is still happening**. A fresh session reads that log once and resumes from it. Final artifacts are then distilled from the durable decision history rather than being the only surviving record of the reasoning that produced them.

Flow should adapt that into three distinct layers:

1. **Decision history** — append-only, compact, durable, and atomic. It records consequential user decisions, rejected alternatives when relevant, assumptions, unresolved questions/dimensions, deferrals, overrides, and phase events.
2. **Current-state projection** — the deterministic resumability view Flow already needs: current phase/subphase, resolved/unresolved/deferred dimensions, live assumptions, latest approved direction, and next decision frontier.
3. **Draft/final contract** — the human-readable PRD, experience artifact, engineering contract, work-item spec, or review result being produced.

The editable/rendered draft may still be deleted when its phase is approved. The **decision history should not be deleted merely because the rendered draft became final** unless the same information has been losslessly folded into another canonical record. This avoids parallel authoritative drafts without throwing away the evidence needed for future Update, conflict detection, recovery, or re-review.

This is a refinement, not a reversal, of Flow's current design: final artifacts remain authoritative for downstream delivery; the decision history is process memory, not a second product/engineering contract.

## The key persistence mechanism: decisions survive each answer

BMAD's shared `memlog.py` defines a flat chronological memory log that persists across sessions. Its important properties are:

- append-only history; no historical insertion, reordering, edit, or delete path;
- one compact entry per meaningful decision/direction/question/assumption/event;
- atomic file replacement after each append;
- no need to reread the log during the same conversation;
- a fresh session reads the log to rebuild context;
- deliverables are derived from that memory rather than treating chat history as authoritative.

The PRD skill is explicit that every decision, change, and override lands in the memlog “as the conversation unfolds,” and that anything not logged is lost on resume. UX uses the same mechanism for design decisions. Architecture logs every decision, constraint, version, assumption, and open question and only distills the architecture spine at the end. Forge captures every decision, crack, kill, direction, and lock as the user answers.

This is the mechanism Flow needs for the requirement in its backlog that a fresh chat resume safely even if the user stopped halfway through discovery.

### Recommended Flow write/resume loop

For every decision-heavy phase:

1. Load approved upstream contracts and the current phase state.
2. Derive the live decision frontier from the current-state projection.
3. Ask only the next independent question batch.
4. As answers arrive, append consequential events to decision history.
5. Recompute and persist the current-state projection atomically.
6. Only then ask the next dependent batch or end the turn.
7. On resume, validate the journal/projection/final-artifact relationship, reconstruct the frontier, and continue without replaying already settled questions.
8. Before finalization, require every relevant blocker to be resolved, explicitly deferred with a safe revisit condition, or marked not relevant.
9. After approval, remove any redundant rendered draft, but retain the compact decision history or fold its durable content into another canonical record.

This gives Flow both what BMAD's chronological log is good at—durable provenance—and what Flow's backlog already demands but BMAD's flat log does not directly provide—a machine-checkable **current unresolved set**.

## Mechanism harvest

### 1. Brain dump + stakes calibration + open concern scan

**Classification: adapt**

**BMAD mechanism**

The PRD skill starts with a brain dump, a small stakes calibration, then chooses a working mode. It scans for the concerns the actual product carries rather than forcing every project through one fixed taxonomy. UX follows the same “concern scan” pattern. Both support a fast path and a coaching path.

**Problem solved**

A rigid questionnaire either asks irrelevant questions or misses project-specific risk. Purely conversational discovery has the opposite failure mode: the model can forget a dimension and prematurely declare the phase complete.

**Recommended Flow adaptation**

Keep Flow's existing organic discovery model. Add the BMAD idea of a fast initial brain dump and stakes calibration, then let the skill dynamically enumerate relevant dimensions from the user's intent, repository evidence, and discovered constraints. Use the current Flow rule that the next batch depends on prior answers.

The working mode should remain a skill judgment rather than a new mandatory user-facing taxonomy. A user asking for speed can permit inference with explicit assumptions; higher-stakes or ambiguous work can use deeper coaching.

**Do not copy**

Do not copy BMAD's exact “Fast path / Coaching path / Journey-led / Vision + Features” menu as a Flow workflow contract. Those are useful interaction patterns, not durable domain states.

### 2. Append-only conversational decision memory

**Classification: adapt**

**BMAD mechanism**

A per-run `.memlog.md` records decisions, changes, assumptions, questions, direction, constraints, and events in chronological order. PRD, UX, architecture, spec, forge, and research reuse the same primitive.

**Problem solved**

Chat context is ephemeral. Editing a draft in place can lose why a decision changed, what was rejected, or which unresolved question is still live. Fresh sessions otherwise need to infer state from an incomplete artifact.

**Recommended Flow adaptation**

Introduce a small Flow-owned persistence primitive for decision-heavy phases. The content vocabulary should be Flow-specific but small: for example decision, rejection, assumption, question/dimension, defer, override, direction, and event. Writes should be atomic and append-only.

The CLI should own structural integrity and atomic persistence; skills should decide _what_ is consequential enough to record.

**Do not copy**

Do not make a generic free-form log the only state Flow can query. Flow needs deterministic projections such as “which relevant dimensions remain unresolved?” and “what is the next safe action?” The journal should feed that projection, not replace it.

### 3. Blind append during the live session; read on resume

**Classification: reuse concept**

**BMAD mechanism**

The shared memlog is designed so callers append atomically without rereading the whole file after every write; the full history is read when a fresh session resumes or an audit needs it.

**Problem solved**

Repeatedly injecting all prior reasoning into the current context is expensive and increases drift. Yet persistence must happen continuously.

**Recommended Flow adaptation**

After a meaningful answer batch, write the compact decision event and update the projection. Keep the active chat's already-known context in memory; do not reload the full history every turn. A fresh chat or recovery path explicitly reloads it.

**Do not copy**

Do not rely on “blind append” if the deterministic projection update fails. Flow should treat a failed journal/projection checkpoint as a persistence failure and avoid advancing the phase as if it were durable.

### 4. Derived artifact + durable decision record

**Classification: adapt**

**BMAD mechanism**

BMAD spec makes the relationship strongest: the memlog is the decision-of-record and the rendered spec is re-derived. Architecture similarly distills its spine from the memlog. PRD and UX also use the log as canonical conversational memory, but their editable artifact model is less uniformly strict.

**Problem solved**

A single mutable document is bad at representing both current truth and historical decision evolution. A pure event log is bad for downstream consumers that need a compact contract.

**Recommended Flow adaptation**

Use a deliberate split:

- approved PRD/experience/engineering/spec = downstream contract;
- decision history = why/how the contract reached its current state and what was superseded;
- current-state projection = resumability and routing.

On Update, reconcile the proposed change against the approved contract and decision history; surface real conflicts instead of silently overwriting prior intent.

**Do not copy**

Do not make every Flow artifact fully regenerated from an event log if that increases implementation complexity without demonstrated value. The important invariant is lossless recovery and conflict detection, not a particular rendering architecture.

### 5. Detect unfinished runs and offer/perform resume

**Classification: reuse concept**

**BMAD mechanism**

PRD, UX, architecture, and forge look for an existing in-progress workspace before creating a new one. Resume reads the saved memory rather than starting discovery from scratch.

**Problem solved**

Fresh chats otherwise fork a second decision process or ask the same questions again.

**Recommended Flow adaptation**

Flow doctor/route should detect a live decision phase and route directly to resume after verifying consistency. In an explicit “start over” request, preserve or supersede the old state deliberately rather than silently forking.

**Do not copy**

Do not use directory globbing and ad-hoc frontmatter conventions as the sole discovery mechanism. Flow already has a deterministic CLI and should have a single structural way to identify active phase state.

### 6. Explicit open questions, assumptions, and stable identities

**Classification: adapt**

**BMAD mechanism**

BMAD spec logs open questions and assumptions, preserves stable `CAP-N` capability IDs, and appends later resolutions instead of rewriting history. Architecture preserves stable `AD-n` IDs across updates.

**Problem solved**

Unresolved issues disappear when they are represented only as prose. Renumbering decisions/capabilities makes handoffs and later updates ambiguous.

**Recommended Flow adaptation**

Give consequential unresolved dimensions/questions stable identities when they need to survive turns, and keep their state in the current projection: unresolved, resolved, deferred, or not relevant. Stable IDs are especially useful once another artifact, review finding, or work item refers to them.

Use stable IDs selectively; a tiny phase does not need ceremony for every conversational detail.

**Do not copy**

Do not expose every low-level question as a permanent public identifier. IDs should exist where cross-turn or cross-artifact reference is materially useful.

### 7. Forge-style pressure testing

**Classification: adapt**

**BMAD mechanism**

`bmad-forge-idea` works one question at a time in dependency order, asks for precision when terms are fuzzy, validates claims against repository evidence for existing projects, and records cracks, kills, directions, and locks. It has explicit attack/defend modes and accepts “Killed” as a successful outcome.

**Problem solved**

Normal elicitation tends toward premature agreement. Plausible assumptions can survive because the agent optimizes for forward progress rather than falsification.

**Recommended Flow adaptation**

Add a bounded challenge step before consequential product/engineering finalization:

- identify the load-bearing assumptions and weakest unresolved claims;
- attack failure modes, contradictions, edge conditions, cost/operability/security implications, and repository conflicts;
- distinguish “still unresolved” from “pressure-tested and accepted”;
- persist new decisions/rejections as they arise;
- return to the normal decision frontier after the challenge pass.

The challenge should be proportional. It should be able to conclude that a proposed direction should be abandoned or materially changed.

**Do not copy**

Do not copy persona theatre, mandatory two-voice debates, attack/defend commands, wax-seal HTML reports, or a separate forge artifact for every Flow phase. The value is adversarial questioning and durable decisions, not the presentation layer.

### 8. BMAD Forge lifecycle/status conventions

**Classification: discard**

**BMAD mechanism**

The generic memlog contract says lifecycle should be represented as chronological events rather than mutable log status. The current Forge skill nevertheless scans memlog frontmatter for `status` and mutates it to `complete`.

**Problem solved**

Forge needs a cheap way to distinguish resumable from finished sessions.

**Recommended Flow adaptation**

Keep lifecycle state outside the append-only decision history. Let Flow's deterministic state/projection own phase status, and let the history record terminal events for audit.

**Do not copy**

Do not mix mutable lifecycle metadata into the same abstraction whose main invariant is append-only historical memory. BMAD's own current implementation demonstrates why the concerns should remain separate.

### 9. PRD Create / Update / Validate as distinct intents

**Classification: reuse concept**

**BMAD mechanism**

One PRD capability supports:

- **Create** — discover and author a new draft;
- **Update** — reconcile a change against the current PRD, addendum, memory, and sources, surfacing conflicts;
- **Validate** — critique without changing the artifact.

**Problem solved**

Treating every invocation as “write the PRD” causes accidental mutation during review and makes change reconciliation implicit.

**Recommended Flow adaptation**

Give Flow's product-contract behavior the same semantic modes, even if they are routed internally rather than exposed as three commands:

- create a product contract;
- update an approved product contract from an explicit change signal;
- validate an existing contract read-only.

Update must preserve unaffected approved decisions and explicitly reconcile conflicts. Validate must not silently fix the PRD.

**Do not copy**

Do not copy BMAD's full run-folder structure, addendum/reconcile/review artifact proliferation, or mandatory report rendering.

### 10. Bootstrap decision memory for pre-existing artifacts

**Classification: adapt**

**BMAD mechanism**

When updating an older PRD that has no memlog, BMAD can reverse-engineer a thin initial decision log from the PRD, then continue appending new decisions.

**Problem solved**

New resumability mechanics need to adopt repositories/artifacts created before those mechanics existed.

**Recommended Flow adaptation**

Flow vNext migration/recovery should be able to seed decision state from existing approved PRD/engineering/work-item artifacts without pretending the reconstructed history is original conversation evidence. Mark reconstructed entries as adopted/recovered facts.

**Do not copy**

Do not fabricate rationale that the approved artifact does not contain. Recovered state should distinguish known contract facts from inferred historical reasoning.

### 11. PRD overflow/addendum separation

**Classification: adapt**

**BMAD mechanism**

BMAD keeps implementation-heavy or downstream-specific depth out of the PRD and can place it in `addendum.md` while preserving it for later consumers.

**Problem solved**

A PRD bloats when it becomes the dumping ground for architecture, UX, rejected-option matrices, and implementation detail.

**Recommended Flow adaptation**

Keep the principle, not the file: product truth belongs in PRD; experience truth belongs in the experience artifact; architecture/topology belongs in `engineering.md`; bounded delivery behavior belongs in work-item specs. If volunteered information belongs downstream, checkpoint it so it is not lost before the owning phase consumes it.

**Do not copy**

Do not introduce a generic permanent `addendum.md` unless Flow later proves it needs one. Flow's existing owning contracts are a cleaner target than another long-lived document.

### 12. UX: separate visual identity from behavior/experience

**Classification: adapt**

**BMAD mechanism**

BMAD UX produces peer contracts: `DESIGN.md` for visual identity and `EXPERIENCE.md` for information architecture, behavior, states, interactions, accessibility, and journeys. Prototypes/wireframes are supporting examples; the spines win on conflict.

**Problem solved**

Visual styling, interaction behavior, and mock artifacts otherwise become a single ambiguous “design” blob. Implementers can mistake a prototype for a complete product contract.

**Recommended Flow adaptation**

Preserve Flow's current “minimum useful artifact” rule, but make ownership explicit when UX matters:

- behavioral experience decisions must be durable;
- visual identity decisions must be durable when they constrain implementation;
- prototypes/wireframes are examples, not authority over the approved experience contract;
- implementation must not invent consequential UX that was left unresolved.

A project may need only journeys/interactions, or behavior plus a small visual contract, rather than two mandatory documents.

**Do not copy**

Do not require `DESIGN.md` + `EXPERIENCE.md`, mock directories, token schemas, or key-screen rendering for every project. That conflicts with Flow's proportional-artifact direction.

### 13. UX “surface closure”

**Classification: reuse concept**

**BMAD mechanism**

UX discovery checks that each stated need has a surface that delivers it and each surface has a journey that lands there; missing links trigger questions rather than invention.

**Problem solved**

A UX artifact can look detailed while still omitting where a requirement actually appears or how a user reaches it.

**Recommended Flow adaptation**

When an experience phase is relevant, add a lightweight closure check: every consequential user-facing requirement must map to an interaction/surface, and every important interaction/surface must be justified by a journey or requirement.

**Do not copy**

Do not turn closure into a mandatory screen inventory for API-only, CLI-only, or otherwise non-visual products.

### 14. Architecture “divergence prevention” test

**Classification: adapt**

**BMAD mechanism**

BMAD's architecture spine asks whether independently built units could make incompatible choices. It records only non-obvious, real trade-offs that must be shared, with stable architecture-decision IDs and fields describing what the decision binds and what divergence it prevents.

**Problem solved**

Architecture documents either under-specify critical seams or over-document things already obvious from the code.

**Recommended Flow adaptation**

Keep `engineering.md` as Flow's broader normative topology contract, but use BMAD's test to improve its decision quality:

> Would separately implemented slices reasonably choose incompatibly here, and would that incompatibility matter?

For load-bearing decisions, record enough to make the rule enforceable and to state the divergence it prevents. Stable IDs may be useful for material architectural decisions referenced by specs/reviews.

**Do not copy**

Do not replace Flow's required system shape, ownership, dependency direction, slicing, naming, data, operations, and verification sections with BMAD's intentionally sparse architecture spine. Flow's engineering contract serves a broader purpose.

### 15. Inherit parent decisions; never silently weaken them

**Classification: reuse concept**

**BMAD mechanism**

A lower-altitude architecture spine treats inherited parent decisions as binding read-only constraints. A local decision that weakens or contradicts one is surfaced as a conflict rather than becoming an implicit override.

**Problem solved**

Fresh agents can create locally reasonable architectures that silently fork the project-wide design.

**Recommended Flow adaptation**

Apply this directly to Flow's hierarchy: work-item specs and implementation inherit approved PRD, experience, and engineering constraints. A material contradiction routes back to the owning upstream contract for update/approval.

**Do not copy**

Do not duplicate inherited contracts into every child artifact. Reference the stable owner and only record the local delta.

### 16. Sources vs companions for handoff

**Classification: adapt**

**BMAD mechanism**

BMAD spec distinguishes sources that were absorbed from companions that remain load-bearing for downstream consumers. Downstream readers get the compact spec plus only the companion artifacts they still need; process memory itself is not handed to every consumer.

**Problem solved**

Handoffs either omit necessary context or dump the entire project history into every worker prompt.

**Recommended Flow adaptation**

Strengthen Flow's minimal worker contract around stable artifact references:

- pass the work-item objective and acceptance criteria;
- pass only the relevant slices of approved PRD/experience/engineering;
- identify additional load-bearing repository artifacts by stable path/ID;
- keep decision journals and review scratch out of ordinary implementation prompts unless the task specifically needs provenance/recovery context.

This matches the current Flow backlog's token-efficiency goal.

**Do not copy**

Do not introduce BMAD's exact companion/source manifest format unless Flow needs it. The mechanism is selective dependency declaration, not the filename schema.

### 17. Small verified repository context instead of duplicated facts

**Classification: adapt**

**BMAD mechanism**

`bmad-project-context` manages a small verified agent-instruction block and treats repository-observable facts as things to verify rather than endlessly duplicate. It can record recurring/costly observed agent mistakes as pitfalls and recommends deterministic enforcement when a mistake is mechanically preventable.

**Problem solved**

Always-loaded context grows stale and expensive, while repeated agent mistakes that could be linted remain prose reminders forever.

**Recommended Flow adaptation**

Keep Flow's existing `AGENTS.md`/repository instructions lean. Use approved artifacts as the source for product/engineering truth. Add always-loaded instructions only when agents need the rule before they know which artifact to inspect and when the rule is not cheaply derivable.

Repeated review evidence should continue to drive Flow's backlog idea: improve worker contracts or promote a repeatedly violated rule to deterministic validation when justified.

**Do not copy**

Do not add a second generated “project context” contract beside `engineering.md` and repository `AGENTS.md`. That would create another ownership boundary to synchronize.

### 18. Independent reviewer contexts

**Classification: reuse concept**

**BMAD mechanism**

PRD, UX, architecture, and code review can dispatch independent reviewer lenses in fresh subagent contexts. Architecture explicitly says an inline self-check does not count because fresh context catches divergences the author talks past.

**Problem solved**

Authors share their own blind spots. A single review pass in the same context can rationalize choices it just made.

**Recommended Flow adaptation**

Keep the backlog rule that the orchestrator should review work it did not implement when practical. For meaningful work, permit proportional independent lenses such as acceptance/intent, engineering, edge cases, and verification gaps. Launch independent lenses without cross-contaminating them, then have the orchestrator synthesize.

**Do not copy**

Do not require a fixed lens count. Flow's model should choose review depth proportional to change risk, size, previous failures, and available runtime capability.

### 19. Verify every review finding before routing it

**Classification: reuse concept**

**BMAD mechanism**

Current Build Auto review does not trust reviewer output blindly. The parent verifies each claim against the code and surrounding context, assigns the routing verdict, and records every finding in the review-triage log before grouping/deduplication.

**Problem solved**

Parallel reviewers produce false positives, duplicates, and plausible fixes for problems that do not actually occur. Silent deduplication also makes review history impossible to audit.

**Recommended Flow adaptation**

Flow's work-item review history should record:

- stable finding ID when useful;
- reviewer/lens and inspected scope;
- claim and evidence;
- orchestrator verification/disposition;
- repair task or accepted residual risk;
- later resolution/carry-forward status.

Only verified defects should become repair work. Similar findings may share a root cause, but none should disappear without a recorded disposition.

**Do not copy**

Do not adopt BMAD's exact high/medium/low/false/maybe-false vocabulary or its repair-routing taxonomy unless Flow independently needs those machine states. The important mechanism is verified triage with no silent loss.

### 20. Re-review carries prior dispositions forward

**Classification: adapt**

**BMAD mechanism**

On a later review pass, Build Auto checks new findings against its existing triage log. The same location/claim against unchanged code carries its previous verdict/route instead of repeating verification and repair. Follow-up review is recommended after material fixes or meaningful residual risk; BMAD guidance warns that repeated findings by a third pass often indicate a weak spec or unclear repository rules rather than a need for infinite review.

**Problem solved**

A fresh reviewer is useful, but a completely memoryless re-review wastes work and can oscillate between previously settled findings.

**Recommended Flow adaptation**

Each Flow re-review should be **fresh in reasoning, persistent in history**:

- use a fresh reviewer context where practical;
- read the prior work-item review history;
- carry forward unchanged findings with their prior disposition;
- inspect changed areas and previously unresolved findings;
- reopen a settled finding only with new evidence or changed code/contract;
- after repeated non-convergence, route to the likely upstream cause: unclear intent, weak spec, or inadequate engineering rule.

**Do not copy**

Do not run identical expensive reviewer sets after every patch by default, and do not encode BMAD's exact numeric follow-up formula. Flow should use review history, change magnitude, and risk to decide whether another pass is warranted.

### 21. Persistent standalone validation reports and HTML renderings

**Classification: discard**

**BMAD mechanism**

PRD/UX validation can preserve per-lens review files and synthesize HTML + Markdown reports; Forge always renders an HTML report.

**Problem solved**

Humans sometimes need a distributable audit/report separate from the source artifact.

**Recommended Flow adaptation**

None as a default. Flow already intends review history to live in the work-item artifact and canonical product/engineering truth in their owning documents.

Generate a separate review/report artifact only when a concrete consumer needs one.

**Do not copy**

Do not make HTML reports, review directories, or one file per lens routine Flow artifacts. They add persistent surface area without improving the default repository-resume contract.

## Scope-by-scope recommendation

### Discovery / elicitation

Keep Flow's current dynamic-dimension approach. Borrow BMAD's brain-dump-first intake, open concern scan, adaptive depth, and infer-and-confirm technique. Do not replace Flow's unresolved-dimension completion gate with BMAD's looser conversational completion judgment.

The Flow-specific improvement over BMAD should be explicit: a deterministic projection must always be able to answer **which relevant discovery dimensions are still unresolved**.

### Unresolved decisions

Persist them as first-class phase state, not just prose in a draft. Every meaningful resolution/defer/not-relevant action should append history and update the live projection.

A defer must be semantically different from “forgotten.” For consequential non-blocking deferrals, retain the reason and a revisit condition/owner when one exists.

### Incremental drafts / checkpoints / resume

Checkpoint after meaningful decision batches, before asking dependent questions or ending a turn. Use atomic repository writes. Recovery validates the relationship between:

- Git/repository state;
- approved upstream artifacts;
- decision history;
- current-state projection;
- any rendered draft.

A fresh chat needs no hidden conversation history.

### Challenge / forge

Make challenge a bounded elicitation mode inside the owning phase. It should specifically try to falsify assumptions, find contradictions, and expose failure conditions. Persist the resulting decisions in the same phase history; do not create a parallel truth source.

### PRD

Support semantically distinct Create, Update, and Validate behavior.

Create uses adaptive discovery and the unresolved-dimension gate. Update starts from the approved PRD and applies only the change signal, surfacing conflicts. Validate is read-only and can use independent reviewers where proportional.

Do not require BMAD's full artifact family or templates.

### UX / experience

Keep Flow's minimum-artifact rule. Borrow explicit ownership boundaries between visual identity and behavior/experience, plus “spines/contracts beat prototypes” and surface closure.

The experience phase should be optional when the product does not need consequential experience decisions, and artifact depth should scale from journeys/interactions to wireframes/prototypes only when seeing the design materially improves the contract.

### Architecture / engineering

Keep `_flow/docs/engineering.md` as the single normative project architecture/topology contract.

Borrow:

- divergence-prevention as the test for which architectural decisions deserve explicit treatment;
- stable IDs for decisions that need cross-artifact references;
- inherited decisions as binding constraints;
- Update/Validate semantics;
- independent reviewer context for consequential architecture.

Do not replace Flow engineering with BMAD's intentionally terse architecture spine.

### Handoffs / context recovery

Downstream agents should consume approved contracts and selected load-bearing references, not process history by default. Decision history is primarily for resume, update, conflict resolution, and audit.

A fresh orchestrator should rehydrate in this order:

1. doctor/structural validation;
2. approved product/experience/engineering contracts;
3. active work-item state;
4. active decision-phase projection if one exists;
5. only the relevant decision-history tail/full history required to explain that projection;
6. Git/traceability evidence;
7. next safe action.

This keeps recovery complete without flooding the new context.

### Review / re-review

Adopt the backlog's append-only review history inside the work item, strengthened with BMAD's verified triage and carry-forward mechanics.

A review pass should record what was inspected, its evidence, every material finding, disposition, repair, and final parecer. Re-review should use fresh analysis but not forget prior dispositions. Repeated non-convergence should be treated as evidence of an upstream contract problem, not an invitation to loop forever.

## Backlog decisions supported by the evidence

The BMAD evidence strongly supports keeping these existing Flow vNext decisions:

- **Dynamic discovery dimensions, not a rigid delivery-posture taxonomy.**
- **No PRD finalization while relevant consequential discovery remains unresolved.**
- **Question batches only when answers are independent; later questions depend on earlier answers.**
- **A challenge/grill step before consequential finalization.**
- **Repository-resumable state written during the decision process, not only at phase completion.**
- **UX as an upstream input when relevant, with the minimum useful artifact rather than mandatory prototypes.**
- **`engineering.md` as the normative architecture/topology contract.**
- **Fresh worker contexts and compact handoffs.**
- **Append-only review history inside the work item.**
- **Independent review lenses when proportional.**
- **Skill/model judgment for depth and parallelism rather than a fixed workflow graph.**

## Backlog decision to reconsider

Current backlog text says:

> Drafts are temporary resumability state. When a decision phase is approved and its canonical artifact/state has been safely persisted, delete the corresponding draft instead of keeping parallel historical copies.

Keep the goal—**do not retain parallel full drafts as competing truth**—but change the deletion boundary.

Recommended replacement principle:

> Rendered/working drafts are temporary and may be deleted after approval. Preserve a compact, append-only decision history for consequential decisions, assumptions, overrides, deferrals, and superseded directions unless that history has been losslessly folded into another canonical record. Approved artifacts remain the downstream contract; decision history exists for resume, update, conflict detection, and audit.

Why reconsider it:

- BMAD's PRD Update uses prior decision memory to detect conflicts rather than treating the current PRD text as the whole history.
- Architecture Update keeps stable decision identities and appends changes, preserving why an invariant exists.
- Spec explicitly relies on the accumulated decision log to avoid drift when multiple upstream/downstream skills update the same intent over time.
- Review re-runs are more efficient because prior dispositions survive and unchanged findings are carried forward rather than rediscovered.

Deleting only the rendered draft satisfies Flow's SSOT concern. Deleting the **only historical decision record** loses information that later phases cannot safely reconstruct.

## Proposed vNext acceptance properties for resumability

These are research-derived properties, not an implementation prescription:

1. **Durable before continuation:** after a consequential answer batch, Flow can crash before the next question and a fresh chat still resumes from the same decision frontier.
2. **No hidden unresolved work:** the persisted projection can enumerate every currently relevant unresolved dimension/question.
3. **Historical monotonicity:** a later decision supersedes an earlier one without erasing that the earlier decision existed.
4. **Atomic checkpointing:** interruption cannot leave a half-written decision/checkpoint that looks valid.
5. **Contract distinction:** a partial decision draft/history can never be mistaken for an approved PRD/experience/engineering/spec contract.
6. **Update conflict detection:** changing an approved contract can surface conflicts with previous consequential decisions.
7. **Bounded recovery context:** a new orchestrator can start from compact current state and read deeper history only when provenance is needed.
8. **Independent review with memory:** fresh reviewer reasoning does not erase prior verified findings/dispositions.
9. **No infinite review loop:** repeated non-convergence routes to intent/spec/engineering repair or a human decision.
10. **Proportional artifacts:** Flow does not require BMAD's folders, HTML reports, two-spine UX package, or full reviewer suite when they do not add value.

## Source evidence

### Flow baseline

- Flow main at research start: https://github.com/Caiqueoak/flow/commit/47c3b45ea6d228636500636c92dbb1b7b755b8ae
- Flow vNext backlog: https://github.com/Caiqueoak/flow/blob/47c3b45ea6d228636500636c92dbb1b7b755b8ae/docs/backlog.md
- Flow skill: https://github.com/Caiqueoak/flow/blob/47c3b45ea6d228636500636c92dbb1b7b755b8ae/skills/flow/SKILL.md
- Discovery: https://github.com/Caiqueoak/flow/blob/47c3b45ea6d228636500636c92dbb1b7b755b8ae/skills/flow/discovery/step-01-project.md
- Decisions: https://github.com/Caiqueoak/flow/blob/47c3b45ea6d228636500636c92dbb1b7b755b8ae/skills/flow/core/decisions.md
- Recovery: https://github.com/Caiqueoak/flow/blob/47c3b45ea6d228636500636c92dbb1b7b755b8ae/skills/flow/core/recovery.md
- Specification: https://github.com/Caiqueoak/flow/blob/47c3b45ea6d228636500636c92dbb1b7b755b8ae/skills/flow/specification/step-01-deepen-spec.md
- Engineering: https://github.com/Caiqueoak/flow/blob/47c3b45ea6d228636500636c92dbb1b7b755b8ae/skills/flow/engineering/step-02-synthesize.md
- Review: https://github.com/Caiqueoak/flow/blob/47c3b45ea6d228636500636c92dbb1b7b755b8ae/skills/flow/review/step-01-review-work-item.md

### BMAD current repository baseline

- BMAD current commit observed for this research: https://github.com/bmad-code-org/BMAD-METHOD/commit/1cbcfa272fe65787c06a1fa164a901f46117cca7
- Shared append-only memory primitive: https://github.com/bmad-code-org/BMAD-METHOD/blob/1cbcfa272fe65787c06a1fa164a901f46117cca7/skills/bmad/scripts/memlog.py
- PRD create/update/validate + discovery + decision memory: https://github.com/bmad-code-org/BMAD-METHOD/blob/1cbcfa272fe65787c06a1fa164a901f46117cca7/skills/bmad-prd/SKILL.md
- PRD validation/reviewer gate: https://github.com/bmad-code-org/BMAD-METHOD/blob/1cbcfa272fe65787c06a1fa164a901f46117cca7/skills/bmad-prd/references/validate.md
- UX contract and resumability: https://github.com/bmad-code-org/BMAD-METHOD/blob/1cbcfa272fe65787c06a1fa164a901f46117cca7/skills/bmad-ux/SKILL.md
- UX validation: https://github.com/bmad-code-org/BMAD-METHOD/blob/1cbcfa272fe65787c06a1fa164a901f46117cca7/skills/bmad-ux/references/validate.md
- Architecture spine, stable decisions, inheritance, update/validate: https://github.com/bmad-code-org/BMAD-METHOD/blob/1cbcfa272fe65787c06a1fa164a901f46117cca7/skills/bmad-architecture/SKILL.md
- Architecture independent reviewer gate: https://github.com/bmad-code-org/BMAD-METHOD/blob/1cbcfa272fe65787c06a1fa164a901f46117cca7/skills/bmad-architecture/references/reviewer-gate.md
- Forge/pressure testing: https://github.com/bmad-code-org/BMAD-METHOD/blob/1cbcfa272fe65787c06a1fa164a901f46117cca7/skills/bmad-forge-idea/SKILL.md
- Spec canonical memory + stable capability IDs + companions/handoff: https://github.com/bmad-code-org/BMAD-METHOD/blob/1cbcfa272fe65787c06a1fa164a901f46117cca7/skills/bmad-spec/SKILL.md
- Project context discipline: https://github.com/bmad-code-org/BMAD-METHOD/blob/1cbcfa272fe65787c06a1fa164a901f46117cca7/skills/bmad-project-context/SKILL.md
- Generic independent review lenses: https://github.com/bmad-code-org/BMAD-METHOD/blob/1cbcfa272fe65787c06a1fa164a901f46117cca7/skills/bmad-review/SKILL.md
- Build Auto verified triage and review loop: https://github.com/bmad-code-org/BMAD-METHOD/blob/1cbcfa272fe65787c06a1fa164a901f46117cca7/skills/bmad-build-auto/step-04-review.md
- Re-review guidance: https://github.com/bmad-code-org/BMAD-METHOD/blob/1cbcfa272fe65787c06a1fa164a901f46117cca7/skills/bmod-method/help/review-choices.md
- Current planning-path guidance: https://github.com/bmad-code-org/BMAD-METHOD/blob/1cbcfa272fe65787c06a1fa164a901f46117cca7/docs/plan/choose-a-planning-path.md

## Bottom line

BMAD's best contribution to Flow vNext is a **mechanism**, not a workflow: persist the decisions while they are being made, separate chronological memory from current routable state and final contracts, and let fresh contexts continue from repository evidence.

Flow should combine that with its existing strengths: explicit unresolved-dimension closure, deterministic structural routing, one normative engineering contract, minimal artifacts, compact worker handoffs, and append-only work-item review history.

That produces a smaller system than BMAD while retaining the parts that most directly improve recovery, decision quality, and review convergence.
