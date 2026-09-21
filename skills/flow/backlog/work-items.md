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

Create the complete set of known MVP work-item shells so the graph is useful, but deeply specify only the next eligible item. Give every outlined shell a concise `## Outcome` statement describing what will observably exist when it is done.

Before persisting a work-item, ask:

- Is this an observable implementation outcome?

- Could it be a task of another outcome?

- Is it only planning, validation, readiness or evidence?

- Can completion be objectively verified?

Then verify the overall graph covers the known MVP without inventing future scope, splits genuinely independent outcomes, and includes only necessary dependencies.
