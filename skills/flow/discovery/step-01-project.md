# Discovery — understand and recommend

Scale discovery depth to ambiguity and consequence, not document length. Discovery is available both when starting a project and when later work exposes a material product or engineering question.

For each consequential topic:

1. explain why the decision matters;
2. present the reasonable options;
3. recommend one using the current goal, repository evidence and selected profile;
4. justify the recommendation;
5. ask one focused question only when the user must decide.

Cover, proportionally:

- problem, users, context, motivation and desired outcomes;

- product journeys, business rules, primary cases, realistic edge cases, risks, metrics and non-goals;

- technical viability questions that can change product behavior, feasibility, cost, operations, security or scope;

- gaps that prevent a coherent product contract, engineering contract or MVP outcome map.

Technical discovery is allowed here when it affects product decisions. Implementation-level architecture is synthesized in engineering after product intent is sufficiently clear.

For existing repositories without Flow, inspect the repository and read `brownfield.md`. Understand both the existing product behavior and the user's requested product change here; produce/approve the PRD before engineering evaluates preserve, incremental or refactor adoption.

Persist durable decisions, rejected alternatives, assumptions and unresolved consequential questions so discovery resumes without repetition. Do not turn discovery into a questionnaire; use the selected profile and repository evidence to make defaults and recommendations.

## W1 checkpoint persistence

Before asking or answering a new consequential discovery batch, inspect the checkpoint in `_flow/state.yaml`. If it targets `_flow/docs/prd.md`, resume from its resolved/unresolved/deferred/not-relevant dimensions, live assumptions, latest authorized direction and `next_frontier`; do not reconstruct those facts from chat history.

If no matching checkpoint exists, start one with `flow checkpoint begin --data <json>`. Persist each meaningful decision batch with `flow checkpoint update --data <json>`. The JSON is the compact checkpoint payload: `phase`, `step`, `target`, `inputs`, `dimensions`, `assumptions`, `latest_authorized_direction` and `next_frontier`. Do not copy PRD prose into it and do not hand-edit `state.yaml`.

W1 provides the structural `approval_ready` transition, but exact project-document approval and approval-owned cleanup belong to W2. Do not treat checkpoint status as document approval.
