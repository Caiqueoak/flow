# Discovery — define project truth

Establish or update `.flow/docs/prd.md`, `.flow/backlog.yaml`, `.flow/state.yaml`, and the minimum initial work items required by current intent. Canonical Flow artifacts are authorized by `/flow`; do not ask permission merely to create them.

Use `W###` IDs in creation order. Kind is separate metadata. Represent every work-item prerequisite in `depends_on`. Keep implementation details just-in-time.

After backlog changes run `flow graph --path .`, then route again. Do not stop for a status report.
