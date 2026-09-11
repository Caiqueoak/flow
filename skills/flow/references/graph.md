# `GRAPH.md` Rules

Every Flow `GRAPH.md` must be a derived, human-readable projection of
`.flow/BACKLOG.yaml`. It never becomes an independent source of truth.

## Generation

After every change to work-item existence, title, status, or dependencies, run:

```text
flow graph --path .
```

The command validates the backlog DAG and regenerates the complete file. Do
not edit `GRAPH.md` directly. It always emits Mermaid with `curve: 'linear'`;
do not replace that setting or introduce curved arrows.

## Card content

Each Mermaid card contains exactly two lines:

```text
<work-item ID>
<work-item title>
```

Do not include status, priority, folder, dependency lists, or explanatory
prose inside a card. The title is the canonical `title` value from
`BACKLOG.yaml`.

## Status derivation and colors

Derive status from the backlog and dependencies after every meaningful state
transition.

| Status | Meaning | Card color | Outgoing arrow style |
| --- | --- | --- | --- |
| Complete | Work item is accepted and complete. | Green (`#16a34a`) | Solid green |
| In progress | Work item has active execution. | Blue (`#2563eb`) | Solid blue, thicker |
| Pending | Every dependency is complete and the item is ready to start. | Yellow (`#d97706`) | Dashed yellow |
| Blocked | The item is neither complete nor in progress and one or more dependencies are incomplete. | Red (`#dc2626`) | Dotted red |

Use matching fill, stroke, and readable text colors for cards. Every graph
must include a titled status legend using these colors.

## Dependencies and arrows

- Draw one arrow for every `depends_on` relationship in `BACKLOG.yaml`.
- The arrow goes from dependency to dependent item.
- Every outgoing arrow inherits the color and line style of its source card.
- Recalculate Mermaid `linkStyle` indexes whenever edges change; do not leave
  a stale style assignment behind.
- Do not add visual-only dependency edges to force layout.

## Parallelism and layout

- Items on the same vertical rank must have no dependency on one another and
  are candidates for parallel work.
- Keep independent, ready items on the same vertical rank where Mermaid can
  represent the real dependency graph without artificial edges.
- Do not represent blocked items as pending merely because they are planned;
  dependency readiness determines their graph status.

## Synchronization checklist

When work-item state, existence, title, or dependencies change:

1. Update `BACKLOG.yaml` first.
2. Recompute derived statuses using the definitions above.
3. Update `GRAPH.md`, including cards, arrows, styles, legend, and parallel
   layout.
4. Update `STATE.md` when the active path or next ready work changes.
5. Verify that every backlog item appears exactly once and every dependency
   appears exactly once in the graph.
