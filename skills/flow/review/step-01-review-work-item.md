# Review — verify delivery

Reread applicable global PRD rules, FULL engineering.md, frozen scope, tasks and approved plan. Review acceptance, regressions, SRP, semantic naming, low coupling/high cohesion, vertical-slice locality and complexity ROI. Explain concrete defects, not stylistic alternatives. Run actual tests and npx --no-install flow validate; never write fake gate evidence.

Defects become new fix tasks. Material approach changes require revised plan approval; never rewrite completed task history. After all tasks, acceptance, gates, qualitative review and traceability pass, run `npx --no-install flow work-item review-complete W### --domain domain`, replacing `domain` with the repository's conventional commit scope. It only finalizes this item; then run `flow route`, which alone selects the next item or finishes the project. Populate spec outcome/implementation/validation and validate again.
