# Command slices

Every public `flow <command>` owns a matching `src/commands/<command>` slice. The registry imports only each slice's `definition.ts`.

Each slice follows `definition.ts -> handler.ts -> usecases/<operation>.ts`. The handler owns CLI adaptation and the local `usecases` dispatch table; use cases own command behavior.

The supported slices are `init`, `doctor`, `migrate`, `status`, `validate`, `route`, `sync`, `trace`, `gates`, `work-item`, `task`, `approval`, `scope`, and `schemas`.
