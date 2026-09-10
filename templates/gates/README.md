# Quality Gates

This directory contains reusable project-wide validation gates created or refined during project discovery and work-item planning.

A gate should be concise, readable, and actionable. Prefer deterministic command checks when tools can verify a rule reliably; use agentic policy gates only when judgment is required.

Suggested frontmatter:

```yaml
---
id: architecture-boundaries
kind: agentic # agentic | command
blocking: true
applies_when:
  - architecture_changed
---
```

A gate may be introduced during a work item. If it establishes a reusable project-wide rule, treat that as a consequential technical decision and obtain developer approval before promoting it to this directory.
