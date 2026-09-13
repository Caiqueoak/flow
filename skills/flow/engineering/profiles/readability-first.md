---
id: flow/readability-first@1
label: Readability First — Recommended
description: Readable, cohesive code with explicit responsibilities and proportional complexity.
---

# Readability First

Load this reusable preference template only when synthesizing or explicitly revising engineering.md. After human approval, engineering.md is the project engineering source of truth; do not reload this profile during ordinary implementation.

- Write code for easy understanding through familiar, consistent patterns. Prefer clarity over cleverness.
- Apply Clean Code and SOLID. SRP is mandatory: each function, class, file and module has one cohesive responsibility and reason to change. SRP does not require tiny fragments or extra layers.
- Use semantic, domain-oriented names for functions, classes, files, folders and variables. Materialize stack-specific casing and examples in engineering.md.
- Keep coupling low and cohesion high. Make dependency direction and ownership explicit.
- Prefer vertical slices around behavior or domain capabilities. Colocate code, tests and private helpers that change together. Shared code needs genuine shared ownership, not generic utils folders.
- Modularize at meaningful boundaries. Do not introduce interfaces, factories, wrappers, layers or infrastructure without demonstrable value exceeding their complexity and maintenance cost.
- State the concrete return on complexity before adding it. Defer speculative abstractions; optimize for reading and changing code.
- Verify behavior, domain logic and external boundaries. Use ecosystem tooling for deterministic checks; qualitative review is not a control-plane fact.

These preferences are not a fixed architecture. Reconcile them with PRD constraints, public contracts, security, stack conventions and explicit exceptions before seeking approval.
