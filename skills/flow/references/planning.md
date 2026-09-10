# Work-item Planning

Read only relevant global decisions, backlog context, existing spec/tasks, and source. Ask consequential work-item decisions only when viable answers materially change behavior, contracts, data semantics, technical boundaries, security, UX, or gates.

For an already authorized work-item artifact class, create or update `.flow/work-items/<id>/SPEC.md` with goal, scope/non-goals, relevant decisions, approach, requirements, acceptance criteria, gates, dependencies/impacts, and validation. Create or update `TASKS.yaml` with bounded, testable, independently executable tasks, real blocking dependencies only, and concise acceptance/validation expectations.

If the required `SPEC.md` or `TASKS.yaml` does not yet exist and the developer has not explicitly requested or authorized creation of that artifact class, request authorization before creating it. Do not create substitute planning documents. After planning, continue automatically into ready execution instead of stopping to report the plan unless a consequential developer decision is required.
