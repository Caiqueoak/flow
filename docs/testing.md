# Testing

Command tests live in `src/commands/<command>/tests`. Pure modules use a `tests/` directory inside their owner root, such as `src/artifacts/tests` and `src/environment/tests`.

Use command tests for CLI contracts, handler dispatch, output formats, and end-to-end command behavior. Use horizontal-module tests for parsing, workflow rules, project persistence, and system-boundary behavior.

Place source-only tests in `tests/unit/`; they must import source modules and run without `dist/`. Place compiled CLI checks in `tests/integration/`; the integration script builds before running them. `npm run verify` is the authoritative development sequence used by the local pre-push hook and CI on Node 24.x. CI separately installs the Node 24-generated tarball in a clean Node 20.19.0 project to validate the consumer contract.
