# Planning — draft an implementation plan

Reread the FULL approved engineering.md, selected spec/tasks, affected code and tests. Write implementation-plan.md BEFORE application edits. Frontmatter: schema_version: 1, work_item: W###, status: draft, engineering_revision and spec_revision SHA256 of the exact UTF-8 files. Calculate with Node crypto; never guess.

Use exact headings:

# Implementation Plan

## Outcome

## Current state

## Proposed changes

## Execution sequence

## Task mapping

## Data and control flow

## Engineering compliance

## Tests and validation

## Risks and rollback

## Deliberately excluded

## Human decisions required

Proposed changes must identify exact paths, functions/classes, responsibilities, signatures/contracts, removals and tests. Explain ordered implementation steps with T### mapping, acceptance evidence, dependency direction, SRP/locality and complexity ROI. Use concrete names and snippets where they clarify the actual implementation. List uncertainty rather than inventing facts. Include migration/rollback when relevant and explicit non-goals. This must be executable by a basic agent without designing missing architecture.

Remove prior approved_at on revision. Present the exact draft and request validation through the next step. Do not implement yet.
