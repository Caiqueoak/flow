# Source topology

Flow organizes application behavior by vertical slice.

```text
src/
├── features/          # user/workflow behavior
│   ├── work-items/
│   ├── tasks/
│   ├── approval/
│   └── scope/
└── shared/            # small, genuinely reused kernel
    ├── cli/
    ├── domain/
    ├── documents/
    ├── filesystem/
    └── git/
```

## How to navigate

When changing behavior, start in `features/<capability>/` and load only the owning slice plus the shared mechanisms it imports.

- `features/` owns use cases and workflow behavior.
- `shared/domain/` owns genuinely shared domain vocabulary and deterministic policies.
- `shared/cli/` owns reusable CLI parsing primitives.
- `shared/documents/` owns reusable document transformations.
- `shared/filesystem/` and `shared/git/` are imperative system boundaries.
- `commands/` may expose compatibility entry points, but must stay thin.

## Dependency rule

Prefer:

`entry point -> vertical slice -> shared kernel -> system boundary`

Avoid business behavior in shared infrastructure and avoid cross-slice imports when a small shared contract is clearer.

## Design rule

> Declarative at the domain and orchestration level, functional for deterministic transformations, imperative only at system boundaries.

Prefer orchestration that reads as:

`read -> validate -> transform -> decide -> write`

Keep code local to its slice until reuse is real and stable. Do not create generic dumping grounds such as `utils`, `helpers`, or `services`.
