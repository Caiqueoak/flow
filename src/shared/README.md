# Shared kernel

Keep this directory intentionally small.

Code belongs here only when it is genuinely reused across vertical slices or represents shared domain vocabulary/system mechanisms. Otherwise keep it inside the owning feature.

- `domain/`: shared vocabulary and deterministic policies.
- `cli/`: reusable argument/input primitives.
- `documents/`: reusable document transformations.
- `filesystem/`: filesystem system boundary.
- `git/`: Git system boundary.

Do not add generic dumping grounds. Prefer specific names and feature-local code until reuse is proven.
