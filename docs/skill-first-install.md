# Install Flow Skill

Flow Skill is instruction-first: no runtime CLI, npm library or compiled assets are required.

After this branch is merged into the public repository:

```sh
npx skills add Caiqueoak/flow --skill flow -g
```

Select your coding agents when prompted. The installer and agent compatibility determine the exact target folder.

For Codex, a manual user-wide install is also supported:
```sh
mkdir -p ~/.agents/skills/flow
# Copy the folder skills/flow/ (SKILL.md plus references/) into ~/.agents/skills/flow/
```
Codex can also discover a repo-scoped skill at `.agents/skills/flow/`.

In Codex, invoke explicitly with `$flow`, or request spec-driven development and let matching choose the skill. Reopen your coding-agent session if it does not discover the skill immediately.

The repository still contains the legacy CLI and documentation during migration. Do not follow legacy `flow doctor/route/sync` guidance when using the new skill. This release is the first step toward removing that runtime, not proof that the CLI has already been removed.

The project being developed stores its own durable project state in `.flow/`; the distributed skill lives outside that directory.
