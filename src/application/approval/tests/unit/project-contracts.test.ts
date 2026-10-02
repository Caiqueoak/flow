import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { approveProjectDocument } from '../../../../domain/project/document.mjs';
import { ENGINEERING_HEADINGS } from '../../../../domain/project/engineering-document.mjs';
import {
  assertProjectContractsAuthorized,
  canonicalProjectDocumentKind,
  inspectProjectContract,
  requiredProjectContracts,
  validateProjectDocument
} from '../../../project-contracts.mjs';

const PRD_HEADINGS = [
  '# Product Requirements',
  '## Purpose',
  '## Users',
  '## Scope',
  '## Requirements',
  '## Constraints',
  '## Non-goals'
] as const;

function root(t: test.TestContext): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-contract-unit-'));
  t.after(() => fs.rmSync(value, { recursive: true, force: true }));
  fs.mkdirSync(path.join(value, '_flow', 'docs'), { recursive: true });
  return value;
}

function draft(headings: readonly string[], metadata = ''): string {
  return `---\nschema_version: 2\nstatus: draft\n${metadata}---\n\n${headings
    .map((heading) => `${heading}\nConcrete contract.`)
    .join('\n\n')}\n`;
}

function approve(text: string): string {
  return approveProjectDocument(text, '2026-10-02T12:00:00Z').text;
}

test('project contract helpers identify canonical documents and structural errors', () => {
  assert.equal(canonicalProjectDocumentKind('_flow/docs/prd.md'), 'prd');
  assert.equal(canonicalProjectDocumentKind('.\\_flow\\docs\\engineering.md'), 'engineering');
  assert.equal(canonicalProjectDocumentKind('_flow/docs/other.md'), null);
  assert.ok(validateProjectDocument('experience', 'not a document').length > 0);
});

test('required project contracts follow approved PRD experience relevance', (t) => {
  const project = root(t);
  assert.deepEqual(
    requiredProjectContracts(project).map((contract) => contract.kind),
    ['prd']
  );
  assert.equal(inspectProjectContract(project, 'prd').exists, false);
  assert.throws(() => assertProjectContractsAuthorized(project), /prd\.md is not authorized/);

  fs.writeFileSync(
    path.join(project, '_flow', 'docs', 'prd.md'),
    approve(draft(PRD_HEADINGS, 'experience: required\n'))
  );
  assert.deepEqual(
    requiredProjectContracts(project).map((contract) => contract.kind),
    ['prd', 'experience', 'engineering']
  );

  fs.writeFileSync(path.join(project, '_flow', 'docs', 'experience.md'), approve(draft(['# Experience'])));
  fs.writeFileSync(
    path.join(project, '_flow', 'docs', 'engineering.md'),
    approve(
      draft(
        ENGINEERING_HEADINGS,
        'baseline:\n  profile: flow/readability-first@2\n  existing_code_policy: not_applicable\n'
      )
    )
  );

  assert.equal(inspectProjectContract(project, 'prd').experience, 'required');
  assert.doesNotThrow(() => assertProjectContractsAuthorized(project));

  fs.appendFileSync(path.join(project, '_flow', 'docs', 'experience.md'), '\nmaterial edit\n');
  assert.throws(() => assertProjectContractsAuthorized(project), /experience\.md is not authorized/);
});

test('not-required experience omits experience from downstream authorization', (t) => {
  const project = root(t);
  fs.writeFileSync(
    path.join(project, '_flow', 'docs', 'prd.md'),
    approve(draft(PRD_HEADINGS, 'experience: not_required\n'))
  );
  fs.writeFileSync(
    path.join(project, '_flow', 'docs', 'engineering.md'),
    approve(
      draft(
        ENGINEERING_HEADINGS,
        'baseline:\n  profile: flow/readability-first@2\n  existing_code_policy: not_applicable\n'
      )
    )
  );

  assert.deepEqual(
    requiredProjectContracts(project).map((contract) => contract.kind),
    ['prd', 'engineering']
  );
  assert.doesNotThrow(() => assertProjectContractsAuthorized(project));
});
