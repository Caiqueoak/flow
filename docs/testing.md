# Testing

Command tests live in `src/commands/<command>/tests`. Pure modules use a `tests/` directory inside their owner root, such as `src/artifacts/tests` and `src/environment/tests`.

Use command tests for CLI contracts, handler dispatch, output formats, and end-to-end command behavior. Use horizontal-module tests for parsing, workflow rules, project persistence, and system-boundary behavior.
