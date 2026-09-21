# Work-item design

A work-item is a cohesive implementation outcome, not a workflow phase. It must describe an observable target state and normally contain one or more repository-changing tasks.

Do not create separate work-items whose only purpose is planning, preparation, evidence collection, readiness checking, validation, review, or another internal step of a different outcome. Make those tasks or gates inside the owning outcome.

Bad decomposition:
- W001 prepare database
- W002 validate database
- W003 implement registration API
- W004 test registration

Better decomposition:
- W001 user registration
  - persistence
  - API
  - UI
  - validation/tests

Before persisting the MVP graph, check:
- every work-item is an independently meaningful outcome;
- the graph covers the known MVP without inventing future scope;
- small phase-like items are merged into tasks;
- oversized items with independent outcomes are split;
- every dependency is necessary and has a clear reason;
- every work-item has an implementation objective, not only analysis or ceremony.

Create the complete set of known MVP work-item shells so the graph is useful, but deeply specify only the next eligible item.
