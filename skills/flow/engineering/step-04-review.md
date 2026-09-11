# Engineering bootstrap — review

## Objective
Audit the architecture recommendation before presenting it.

## Required actions
1. Validate breadth: every architecture scope dimension is explicitly resolved.
2. Validate proportionality: flag speculative abstractions, unnecessary layers/services/interfaces, or tooling whose complexity is not justified.
3. Validate consistency: dependency rules, organization, naming, testing, operations, and enforcement do not contradict one another.
4. Validate enforceability: each blocking rule has a real gate; deterministic checks are preferred over agentic judgment.
5. Run an independent architecture/maintainability review when the runtime can do so without losing orchestration control.
6. Apply clear fixes before presentation.

Before leaving this step, create/update `.flow/state.yaml` with `execution.phase: engineering_bootstrap`, `execution.step: present`, and `stop_reason: null`.

## NEXT
Present one coherent recommendation to the developer.
