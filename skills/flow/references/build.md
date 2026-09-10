# Build

Compute ready tasks, exclude claims by another execution ID, select the largest safe set, and mark it `in_progress` before editing or delegating. Load only relevant specs, decisions, code, and gates. Follow approved conventions, avoid unrelated refactors, run the cheapest relevant deterministic checks, make atomic commits, and mark tasks complete only after acceptance checks pass.

Synchronize `TASKS.yaml`, `BACKLOG.yaml`, `STATE.md`, `GRAPH.md`, and other affected approved canonical artifacts at each meaningful transition. Never create a new document or artifact unless the developer explicitly requested or authorized it. If a consequential new choice emerges, stop only the affected path and present the decision while independent paths continue when safe.

Do not pause or return control merely to report that a task or work item completed, to announce progress, or to state the next step. Recompute readiness and continue automatically while useful ready work exists. Surface execution status only when developer input is required or execution has actually stopped.
