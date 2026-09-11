# Engineering bootstrap — inspect

## Objective
Understand the project before proposing standards.

## Required actions
1. Read the configured engineering profile and brownfield policy from `.flow/config.yaml`.
2. Inspect technologies, frameworks, package/build/test configuration, deployment constraints, public APIs, persistence, and meaningful existing structure.
3. Under `rebaseline`, treat existing code as evidence of behavior/constraints, **not** as authoritative engineering style. Under `preserve`, treat strongly consistent patterns as candidates to retain.
4. Identify credible near-term growth from product/project context; do not invent hypothetical scale.
5. Persist only information required for the next bootstrap step; do not implement application code.

## Exit conditions
You can state the stack, hard constraints, current verification/tooling, and likely growth envelope without relying on chat memory.

Before leaving this step, create/update `.flow/state.yaml` with `execution.phase: engineering_bootstrap`, `execution.step: synthesize`, and `stop_reason: null`.

## NEXT
Run `flow route --json`. The next bootstrap step is synthesis.

## Invalid exits
Do not ask the user to choose architecture primitives they may not understand. Do not begin implementation.
