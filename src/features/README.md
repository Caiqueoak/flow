# Features

Each directory owns application behavior for one capability. Start here when changing how Flow behaves.

Keep orchestration declarative and local. Prefer pure deterministic transformations inside the slice and delegate filesystem, Git, process, network or other external effects to explicit shared boundaries.

Do not import another feature just to reuse implementation details. If a concept is genuinely shared, promote the smallest stable contract or mechanism to `shared/`.
