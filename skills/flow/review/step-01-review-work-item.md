# Review — verify the delivered outcome

Read the work-item SPEC, applicable engineering contract, tasks and implementation commits resolved through `flow trace`.

Verify observable acceptance, regressions, relevant edge cases, tests/gates, traceability and qualitative engineering constraints. Judge the delivered outcome, not whether Flow ceremony was followed. Explain concrete defects rather than stylistic alternatives.

Explicitly compare changed code with the approved engineering.md: system shape, module ownership, dependency direction, vertical-slice placement, naming/readability conventions and documented exceptions. A material architectural deviation is a defect even when tests pass. Do not approve a work-item that introduced an implicit parallel topology or undocumented dependency direction. If the intended architecture itself must change, revise and approve engineering.md before accepting code that depends on that change.

Also review readability-first qualities in touched code: intent before mechanics, SRP, SSOT, low coupling/high cohesion, KISS, semantic naming, local ownership and absence of unnecessary complexity. Ask whether the implementation is easy to understand and identify concrete violations that increase maintenance cost.

Persist review progress in review.yaml v2 through `flow work-item review-pass`; do not hand-edit finalized pass history. Use stable finding IDs for findings that need repair or later disposition. Checkpoint the mutable active pass whenever interruption could otherwise lose inspected scope, evidence, parecer, findings, repair links, resolutions, residual risk, or known worker-run evidence. Omit runtime/model/effort/context/isolation/usage fields that are not actually known.

If a defect is found before completion, add a normal repair task to the same active work-item and link it to the finding. Later review passes resolve, reopen, supersede, or explicitly accept residual risk for prior findings without rewriting earlier passes.

When a review pass is complete, checkpoint its full data and finalize it atomically with `flow work-item review-pass W### --mode finalize`. Approval is valid only when the latest finalized pass is `approved` and no blocking finding folds to `open` or `reopened`.

When acceptance, appropriate verification, qualitative review and traceability pass, run `npx --no-install flow work-item review-complete W### --domain domain`. That command records canonical Git evidence and clears active focus; it does not rewrite finalized review history. Record concise outcome/validation in the SPEC when required, validate, route again and continue.

After completion, later corrections follow `../maintenance/corrections.md` and become new maintenance work-items.
