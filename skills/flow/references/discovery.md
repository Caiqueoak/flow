# Global Discovery

## Goal

Define the smallest coherent, production-capable MVP and the global product/engineering rules required to plan it. Do not specify work-item detail prematurely.

## Scope

Resolve only consequential global decisions affecting the problem, users, MVP, business constraints, production environment, deployment, architecture, persistence, integrations, security, observability, testing, conventions, documentation, Git strategy, and reusable gates. Infer trivial conventions from the existing codebase or chosen ecosystem.

## Outputs

Update valid canonical artifacts when their truth changes. Create `PRD.md`, `ENGINEERING.md`, `DECISIONS.md`, `BACKLOG.yaml`, `STATE.md`, `GRAPH.md`, work-item artifacts, or gate definitions only when the developer explicitly requested or authorized creation of that artifact class. Never create substitute, progress, summary, handoff, or ad-hoc documents to capture information that belongs in an existing approved artifact.

`GRAPH.md` is a derived human-readable projection of `BACKLOG.yaml`, not an independent source of truth. Discovery ends when no unresolved global decision is needed for a coherent production-capable MVP and initial work-item DAG.
