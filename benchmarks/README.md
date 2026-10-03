# Flow vNext evaluation harness

W8 provides a repeatable repository-level harness for the initial high-signal benchmark core:

B01, B02, B05, B06, B07, B08, B11 and B12.

The harness does **not** execute or simulate a model. It prepares an isolated run workspace, records stable run identity, and evaluates externally produced observations against deterministic evaluator-only truth. Judgment dimensions remain rubric-scored and may stay pending until a human or model evaluator supplies scores.

## Separation of context and truth

- `benchmarks/fixtures.json` contains only agent-visible fixture context.
- `benchmarks/evaluator-truth.json` contains hard assertions, seeded defect labels, and rubrics.
- `prepare` copies only the selected agent context into the run workspace.
- no benchmark depends on chat history; all required agent inputs must be present in the prepared workspace.

## Validate definitions

```sh
npm run benchmark:check
```

This is also part of `npm run verify`.

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

The command prints the new run directory. By default it is created under `.flow-evaluation/runs/`. A run directory is never reused; use a distinct repeat/run ID for every attempt.

The manifest preserves:

- benchmark ID;
- exact Flow revision;
- runtime/model/config identifiers when exposed;
- repeat number;
- run ID;
- telemetry state.

Unknown runtime/model/config values should be omitted and remain `null`, not guessed.

## Execute externally

Run the chosen agent/runtime against only the prepared `workspace/agent-context.json` plus the fixture workspace. Do not expose `benchmarks/evaluator-truth.json` to the acting agent.

The external runner writes `observation.json` inside the run directory:

```json
{
  "facts": {
    "finalized": false,
    "unresolved_preserved": true
  },
  "telemetry": {
    "status": "unavailable"
  },
  "rubric_scores": {
    "decision_frontier_quality": 2
  },
  "evaluator_notes": "Optional evaluator note."
}
```

If reliable token/cost telemetry is exposed, use `status: "available"` and include only values actually reported by that runtime. Unavailable telemetry must never be encoded as zero. Do not derive billed cost from token counts without a stored pricing contract.

Rubric scores are optional. Missing scores remain `pending`; the harness never invents model-judged outcomes.

## Evaluate

```sh
npm run benchmark -- evaluate --run .flow-evaluation/runs/<run-id>
```

This writes `result.json` once. It contains deterministic hard assertion outcomes, rubric definitions/scores, exact run identity, telemetry, and evaluator notes. Re-evaluating the same run is rejected to preserve prior results.

## Result interpretation

Hard pass/fail is limited to mechanically checkable fixture facts. B11 efficiency comparisons require matched successful runs and real telemetry when available; this harness intentionally does not claim token improvements by itself.

The W1-W7 test suite remains the structural regression baseline required by technical-design §17, including interruption-safe checkpoint/work-item publication, concurrency conflict prevention, append-only review closure, and stale/conflicting-state reconciliation. W8 adds harness-specific tests for fixture/truth alignment, evaluator-truth isolation, non-overwriting repeated runs, unavailable telemetry semantics, deterministic evaluation, and run-path containment.

## Residual limitation

Live model/runtime execution is not portable across supported environments, so W8 stops at the repeatable fixture/manifest/observation/evaluator contract. A CI or external runtime adapter may invoke the commands above without changing benchmark semantics.
