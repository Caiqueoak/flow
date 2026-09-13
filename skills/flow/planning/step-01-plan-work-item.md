# Planning — materialize the complete backlog

Reread the FULL approved engineering.md and PRD. Decompose all known approved scope into bounded work items and dependencies; do not invent future scope. Create backlog.yaml schema_version: 2, work_items with id W###, folder W###-kebab-case, kind feature|technical|maintenance, title, state pending, priority positive integer, depends_on and blockers.

Create EVERY known work-item folder with spec.md and tasks.yaml before implementation. Existing completed artifacts stay intact. Specs include ## Status, ## Goal, ## Scope, ## Non-goals, ## Requirements, ## Acceptance criteria, ## Decisions, ## Implementation, ## Final outcome, ## Validation and ## Follow-up. Tasks: schema_version: 1, work_item: W###, tasks with local T### IDs, title, state pending, depends_on, implementation commit|none. Preserve already completed task history.

Structured blockers: id stable-kebab-case, type external_action|consequential_decision, description, status unresolved|resolved. Do not encode dependencies as external blockers.

Create/maintain gates.yaml and state.yaml; regenerate graph with npx --no-install flow graph. Run npx --no-install flow validate. Route again; no application code in this step.
