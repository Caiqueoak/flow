# Continuation

A routed step is an action, not a stopping point.

After every successful step:

1. persist the result through Flow or Git;
2. run the minimum required validation;
3. run `npx --no-install flow route --json`;
4. immediately execute the next routed step.

Stop only for completion, a consequential human decision, an external action only the user can perform, or an unrecoverable blocker. Do not stop for status reporting, phase transitions, completed tasks, successful validation, or because planning/specification finished.
