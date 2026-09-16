# Planning — materialize the complete backlog

Reread the FULL approved engineering.md and PRD. Decompose all known approved scope into bounded work items and dependencies; do not invent future scope. Create backlog.yaml schema_version: 3 with outlined work items using id W###, folder W###-kebab-case, kind feature|technical|maintenance, title, state pending, priority positive integer, spec_maturity, depends_on and blockers.

Do not eagerly create folders, specs, tasks or plans for outlined work. When a selected item is ready, create its spec, then tasks.yaml schema_version: 2 with local T### IDs, title, state pending, depends_on and traceability commit|none. Preserve completed history and legacy_commit provenance; never use the retired implementation task field.

Structured blockers: id stable-kebab-case, type external_action|consequential_decision, description, status unresolved|resolved. Do not encode dependencies as external blockers.

Create/maintain gates.yaml and state.yaml; regenerate graph with npx --no-install flow graph. Run npx --no-install flow validate. Route again; no application code in this step.
