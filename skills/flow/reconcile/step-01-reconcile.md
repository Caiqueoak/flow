# Reconcile — restore canonical truth

Resolve inconsistencies using the single-owner rule: product truth in `docs/prd.md`, engineering truth in `docs/engineering.md`, work-item graph/state in `backlog.yaml`, task state in `tasks.yaml`, current cursor in `state.yaml`, and task implementation identity in Git trailers.

Do not rewrite completed history to hide change. Create fix tasks or maintenance work items. Regenerate `docs/graph.md` after backlog mutation and validate before routing again.

For engineering changes, reread the full approved engineering.md and propose a draft revision through engineering/step-02-synthesize.md. Obtain explicit human approval before replacing the contract. New engineering/spec revisions invalidate affected implementation plans. Do not silently change config preferences or copy old approval timestamps. Use only npx --no-install flow commands.
