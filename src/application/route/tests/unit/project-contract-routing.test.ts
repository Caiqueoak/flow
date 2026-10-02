import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { approveProjectDocument } from '../../../../domain/project/document.mjs';
import { ENGINEERING_HEADINGS } from '../../../../domain/project/engineering-document.mjs';
import { routeProject } from '../../operations/route.mjs';

const PRD_HEADINGS = [
  '# Product Requirements',
  '## Purpose',
  '## Users',
  '## Scope',
  '## Requirements',
  '## Constraints',
  '## Non-goals'
] as const;

function project(t: test.TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-route-w2-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '_flow', 'docs'), { recursive: true });
  fs.mkdirSync(path.join(root, '_flow', 'work-items'), { recursive: true });
  return root;
}

function draft(headings: readonly string[], metadata = ''): string {
  return `---\nschema_version: 2\nstatus: draft\n${metadata}---\n\n${headings
    .map((heading) => `${heading}\nConcrete contract.`)
    .join('\n\n')}\n`;
}

function writeApproved(file: string, text: string): void {
  fs.writeFileSync(file, approveProjectDocument(text, '2026-10-02T12:00:00Z').text);
}

test('route enforces exact PRD and required experience approvals before engineering', (t) => {
  const root = project(t);
  assert.deepEqual(routeProject(root), {
    action: 'continue',
    phase: 'discovery',
    instruction: 'discovery/step-01-project.md'
  });

  const prd = path.join(root, '_flow', 'docs', 'prd.md');
  fs.writeFileSync(prd, draft(PRD_HEADINGS, 'experience: required\n'));
  assert.equal(routeProject(root).instruction, 'discovery/step-02-await-approval.md');

  writeApproved(prd, fs.readFileSync(prd, 'utf8'));
  assert.deepEqual(routeProject(root), {
    action: 'continue',
    phase: 'experience',
    instruction: 'experience/step-01-define.md'
  });

  const experience = path.join(root, '_flow', 'docs', 'experience.md');
  fs.writeFileSync(experience, draft(['# Experience']));
  assert.equal(routeProject(root).instruction, 'experience/step-02-await-approval.md');

  writeApproved(experience, fs.readFileSync(experience, 'utf8'));
  assert.deepEqual(routeProject(root), {
    action: 'continue',
    phase: 'engineering',
    instruction: 'engineering/step-02-synthesize.md'
  });

  const engineering = path.join(root, '_flow', 'docs', 'engineering.md');
  writeApproved(
    engineering,
    draft(
      ENGINEERING_HEADINGS,
      'baseline:\n  profile: flow/readability-first@2\n  existing_code_policy: not_applicable\n'
    )
  );
  assert.deepEqual(routeProject(root), {
    action: 'continue',
    phase: 'planning',
    instruction: 'planning/step-01-plan-work-item.md'
  });

  fs.appendFileSync(engineering, '\nmaterial edit\n');
  assert.equal(routeProject(root).instruction, 'engineering/step-05-present.md');
});

test('route skips experience when the exact-approved PRD says not_required', (t) => {
  const root = project(t);
  writeApproved(
    path.join(root, '_flow', 'docs', 'prd.md'),
    draft(PRD_HEADINGS, 'experience: not_required\n')
  );

  assert.deepEqual(routeProject(root), {
    action: 'continue',
    phase: 'engineering',
    instruction: 'engineering/step-02-synthesize.md'
  });
});
