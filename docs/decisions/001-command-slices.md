# 001: Command slices own the CLI boundary

Flow organizes application code by public CLI command. A command slice owns its definition, handler, use cases, and tests. Cross-command behavior belongs to a concrete horizontal module only when it has an explicit responsibility outside a single command.
