# Review — verify the delivered outcome

Read the work-item SPEC, applicable engineering contract, tasks and implementation commits resolved through `flow trace`.

Verify observable acceptance, regressions, relevant edge cases, tests/gates, traceability and qualitative engineering constraints. Judge the delivered outcome, not whether Flow ceremony was followed. Explain concrete defects rather than stylistic alternatives.

If a defect is found before completion, add a repair task to the active work-item and continue implementation. Do not rewrite completed task history.

When acceptance, appropriate verification, qualitative review and traceability pass, run `npx --no-install flow work-item review-complete W### --domain domain`. Record concise outcome/validation in the SPEC when required, validate, route again and continue.

After completion, later corrections follow `../maintenance/corrections.md` and become new maintenance work-items.
