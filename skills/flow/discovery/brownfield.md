# Brownfield adoption

A repository with existing application code and no Flow metadata is a first-class Flow project. `flow init` only records that adoption is undecided unless the user explicitly supplied a strategy; qualitative selection happens here after inspection.

Inspect the repository before recommending an adoption strategy. Identify the observed architecture, topology, ownership, naming, testing, tooling, persistence, integrations, CI/deployment and meaningful inconsistencies. Compare that observed state with the selected engineering profile, but never treat profile mismatch as authorization to refactor.

Present three strategies when the difference is material:

- **preserve** — keep coherent existing architecture and conventions;
- **incremental** — preserve unrelated code while new/touched areas move toward the desired engineering contract;
- **refactor** — align the existing structure before feature delivery.

Recommend one with project-specific justification. The user chooses because this materially changes delivery scope and regression risk.

Engineering must distinguish observed state, desired state and adoption strategy. Existing coherent patterns are evidence; accidental inconsistency is not authority.
