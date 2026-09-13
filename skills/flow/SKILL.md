---
name: flow
description: Repository-resumable software delivery through discovery, approved engineering, complete backlog planning, human-approved implementation plans, serial implementation and review. Use /flow to start or continue this workflow.
---

# Flow

/flow is the only public agent workflow. Incorporate current developer intent before routing; repository routing does not authorize ignoring new requests.

Read invariants.md once per invocation. All Flow CLI commands MUST use the project-local installation: `npx --no-install flow`. If unavailable, stop and ask for local installation; never use a global executable or fetch a different package automatically.

1. Run `npx --no-install flow route --json`.
2. Read the returned instruction from this installed skill and every returned required_context file. Planning, implementation and review require rereading the FULL .flow/docs/engineering.md immediately before that step, including after resumption.
3. Execute only the routed step, persist canonical artifacts and run its required checks.
4. Route again. Continue until an actual human decision, external action, unrecoverable blocker or completion.

If stopped for approval, present the exact proposal and ask explicitly. Never approve your own work or treat silence as consent. Human approval must be persisted with status: approved and approved_at: ISO timestamp in the approved document. Clear state.stop_reason only when the current message resolves its decision. Revisions require a new approval, not copying an old approved_at.

Artifact owners: docs/prd.md product; docs/engineering.md engineering; backlog.yaml work-item DAG; work-items/W###-slug/spec.md scope; tasks.yaml task DAG; implementation-plan.md approved approach; state.yaml cursor; gates.yaml mechanical checks; docs/graph.md derived. Preserve completed history; changed completed scope becomes new maintenance work.

Engineering changes go through reconcile/step-01-reconcile.md: propose the change, obtain approval and invalidate affected plans. A profile is bootstrap input, never a second policy engine competing with approved engineering.
