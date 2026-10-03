# Flow vNext evaluation harness

W8 provides a repeatable repository-level harness for the initial high-signal benchmark core:

B01, B02, B05, B06, B07, B08, B11 and B12.

The harness does **not** execute or simulate a model. It prepares isolated canonical fixture workspaces and evaluates mechanically checkable outcomes from repository state plus evaluator-owned event evidence. Qualitative judgments remain rubric-scored and may stay pending.

## Separation of executor output and evaluator truth

- `benchmarks/fixtures.json` contains agent-visible fixture context and deterministic workspace files.
- `benchmarks/evaluator-truth.json` contains evaluator-only hard assertions, seeded truth, and rubrics.
- `prepare` validates fixtures with the real Flow state/work-item/recovery/route parsers before accepting a run.
- the acting executor works only inside `workspace/` and does not author hard-pass facts.
- evaluator/runtime adapters may write `evaluator-events.json` at the run root for mechanically observed events such as writer lifecycle or verification outcomes.
- `observation.json` carries telemetry, optional metrics, rubric scores, and notes; self-reported `facts` are ignored by hard evaluation.

No benchmark depends on hidden chat history.

## Validate definitions

```sh
npm run benchmark:check
```

This is part of `npm run verify`. Validation rejects malformed fixture projects and proves runtime-oriented fixtures are consumable by the canonical Flow parsers/routes they exercise.

## Prepare a run

```sh
npm run benchmark -- prepare \
  --benchmark B01 \
  --flow-revision <exact-flow-sha> \
  --repeat 1 \
  --runtime <runtime-id> \
  --model <model-id> \
  --config <config-id>
```

The command creates a fresh run under `.flow-evaluation/runs/` by default. Existing run directories are never reused. `manifest.json` preserves run identity plus evaluator-owned baseline hashes for the prepared fixture workspace.

## Execute externally

Run the chosen agent/runtime against `workspace/agent-context.json` and the prepared fixture workspace. Do not expose evaluator truth or evaluator event channels to the acting executor.

The external runner writes `observation.json`:

```json
{
  "telemetry": {
    "status": "unavailable"
  },
  "rubric_scores": {
    "decision_frontier_quality": 2
  }
}
```

Benchmark-specific executor artifacts live inside `workspace/` (for example `handoff.json` or `review-output.json`). Evaluator/runtime adapters record mechanically observed events in `evaluator-events.json` outside the actor workspace when a benchmark needs them.

For B12, preparation preserves evaluator-owned baseline evidence that the fixture initially requires reconciliation. The adapter records `reconciliation_authorized` before any allowed repair, records state changes as `workspace_mutation` with `id: "_flow/state.yaml"`, and may record prohibited external behavior as `unsafe_action`. Evaluation rejects mutation/unsafe action before authorization and requires the authorized repair to end in safe non-reconcile routing.

If reliable token/cost telemetry is exposed, use `status: "available"` and include only values actually reported by that runtime. Unavailable telemetry must never be encoded as zero. Missing rubric scores remain `pending`.

## Evaluate

```sh
npm run benchmark -- evaluate --run .flow-evaluation/runs/<run-id>
```

Evaluation derives hard facts from canonical workspace artifacts, baseline evidence, and evaluator-owned events, then applies evaluator-only assertions. Executor-authored booleans do not determine hard pass/fail. `result.json` is write-once.

B05 deliberately does **not** require parallel execution for independent work. Zero unsafe/conflicting writer overlap is hard; whether independent work should parallelize is capability/proportionality-aware and remains a rubric judgment.

## Result interpretation

Hard pass/fail is limited to mechanically checkable evidence. B11 efficiency comparisons still require matched successful runs and real runtime telemetry; this harness does not claim token, cost, or quality improvements by itself.

The W1-W7 suite remains the structural regression baseline. W8 adds fixture-integrity, evaluator-evidence, non-overwrite, telemetry, safe-concurrency, seeded-review, repair-history, and recovery-path regressions.

## Residual limitation

Live model/runtime execution remains external because Flow does not assume one portable model execution API. Run artifacts are evaluation evidence, not canonical project state, and no benchmark result or improvement is invented by the repository harness.
