import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENGINEERING_HEADINGS,
  ENGINEERING_TOPOLOGY_HEADINGS,
  validateEngineeringDocument
} from '../../engineering-document.mjs';

function engineeringDocument(): string {
  const sections = ENGINEERING_HEADINGS.map((heading) => `${heading}\nConcrete project contract for ${heading}.`).join(
    '\n\n'
  );
  return `---\nschema_version: 1\nstatus: approved\napproved_at: 2026-01-01T00:00:00.000Z\nbaseline:\n  profile: flow/readability-first@2\n  existing_code_policy: incremental\n---\n\n${sections}\n`;
}

test('engineering contract requires concrete architecture and topology sections', () => {
  const valid = engineeringDocument();
  assert.deepEqual(validateEngineeringDocument(valid).errors, []);

  for (const heading of ENGINEERING_TOPOLOGY_HEADINGS) {
    const placeholder = valid.replace(`${heading}\nConcrete project contract for ${heading}.`, `${heading}\nTBD`);
    assert.ok(
      validateEngineeringDocument(placeholder).errors.includes(
        `${heading} must define a concrete project architecture/topology contract.`
      )
    );
  }
});

test('engineering contract rejects an empty mandatory topology section', () => {
  const valid = engineeringDocument();
  const empty = valid.replace('## System shape\nConcrete project contract for ## System shape.', '## System shape\n');
  assert.ok(
    validateEngineeringDocument(empty).errors.includes(
      '## System shape must define a concrete project architecture/topology contract.'
    )
  );
});
