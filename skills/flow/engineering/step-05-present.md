# Engineering bootstrap — present

## Objective
Give the developer a complete recommended architecture to approve or challenge.

## Presentation
Summarize the recommendation from macro to micro: system shape, boundaries, organization, state/data ownership, conventions, quality strategy, tooling/enforcement, and explicit deferred complexity. Explain important alternatives only where a real trade-off exists.

The developer may challenge any part. Do not force them to design the architecture from scratch.

When presenting the proposal, persist `.flow/state.yaml` with `execution.phase: engineering_bootstrap`, `execution.step: present`, and `stop_reason: consequential_decision` before yielding for approval.

If they approve, clear `stop_reason`, mark `engineering.md` frontmatter `status: approved`, set `state.yaml` to `execution.phase: discovery` / `execution.step: define_project`, apply the approved tooling/configuration changes, run required deterministic checks, and run `flow validate` once the canonical project artifacts exist. If they request changes, revise the contract and repeat review before approval.

## Terminal rule
Developer approval is consequential input, so this step may stop for that decision. After approval, immediately resume normal Flow routing.
