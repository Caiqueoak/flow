# Flow architecture

## Ownership

| Location                  | Owns                                                                       |
| ------------------------- | -------------------------------------------------------------------------- |
| `src/cli/`                | Terminal input, command metadata, dispatch and output                      |
| `src/commands/<command>/` | One public `flow <command>` boundary, handler, use cases and command tests |
| `src/contracts/`          | Stable identifiers, types, layouts and schema versions                     |
| `src/artifacts/`          | Flow artifact parsing and serialization                                    |
| `src/execution/`          | Pure execution state, lifecycle, commit and gate rules                     |
| `src/flow-project/`       | Persistence and aggregate operations for a Flow project                    |
| `src/package-assets/`     | Profiles and runtime skills shipped with Flow                              |
| `src/environment/`        | Filesystem, Git and process boundaries                                     |

## Dependency direction

```text
cli -> commands -> flow-project / artifacts / execution / contracts
flow-project -> artifacts / execution / contracts / environment
package-assets -> contracts / environment
environment -> Node and external programs
```

No module outside `cli` imports terminal behavior. No horizontal module imports a command slice.

## Command slice

`definition.ts` describes the public command, `handler.ts` adapts CLI input and output, and `usecases/` contains the named business operations. A compound handler keeps a local `usecases` dispatch table. Tests live in the slice's `tests/` directory.

## Published schemas

`src/commands/schemas/schema-definitions.ts` owns schema source. `schemas/` contains generated public assets and must not be manually edited.
