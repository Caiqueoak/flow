import assert from 'node:assert/strict';
import test from 'node:test';
import { documentMetadata, documentRevision, validateDocument } from '../../document.mjs';
import { validateEngineeringDocument, ENGINEERING_HEADINGS } from '../../engineering-document.mjs';
import { validatePrdDocument } from '../../product-requirements-document.mjs';
import { PLAN_HEADINGS, validateImplementationPlan } from '../../implementation-plan-validation.mjs';
import { deriveExecutionStatus, parseBacklog, topologicalOrder } from '../../backlog.mjs';
import { parseGates } from '../../gate-definitions.mjs';
import { parseReview, stringifyReview } from '../../work-item-review.mjs';
import { parseTasks, qualifiedTaskId } from '../../work-item-task-list.mjs';
import { parseWorkItemSpec, validateSpec } from '../../work-item-specification.mjs';

type ParsedBacklog = { work_items: Array<{ id: string; state: string; depends_on: string[]; blockers: unknown[] }> };
const parseBacklogTyped = parseBacklog as (text: string) => ParsedBacklog;
const parseTasksTyped = parseTasks as (
  text: string,
  options?: { expectedWorkItem?: string; source?: string }
) => { tasks: unknown[] };
const parseSpecTyped = parseWorkItemSpec as (
  text: string,
  options?: { expectedWorkItem?: string }
) => { metadata: Record<string, unknown>; body: string };
const parseReviewTyped = parseReview as (
  text: string,
  options?: { expectedWorkItem?: string; source?: string }
) => Record<string, unknown>;

function document(headings: readonly string[], extra = '') {
  return `---\nschema_version: 1\nstatus: approved\napproved_at: 2026-01-01T00:00:00.000Z\n${extra}---\n\n${headings.map((heading) => `${heading}\nText.`).join('\n\n')}\n`;
}

test('document validation reports metadata and heading failures deterministically', () => {
  const text = document(['# Title', '## Required']);
  assert.equal(documentMetadata(text).status, 'approved');
  assert.equal(documentRevision(text), '4b4777a14fbbbf2b97c0ec0d546799755a2ad4621d30662f23151cc02a52710d');
  assert.notEqual(documentRevision(text), documentRevision(`${text}\nchanged`));
  assert.deepEqual(validateDocument(text, ['# Title', '## Required']).errors, []);
  assert.match(validateDocument('text', ['# Missing']).errors.join(' '), /Missing YAML frontmatter/);
  assert.throws(() => documentMetadata('---\n- list\n---\n'), /mapping/);
});

const validBacklogItem = {
  id: 'W101',
  folder: 'W101-first-item',
  kind: 'feature',
  title: 'First item',
  state: 'pending',
  priority: 1,
  spec_maturity: 'outlined',
  depends_on: [],
  blockers: []
};

function backlogWith(item: Record<string, unknown>) {
  const { stringify } = requireYaml();
  return stringify({ schema_version: 4, work_items: [{ ...validBacklogItem, ...item }] });
}

function requireYaml() {
  // Kept local so fixture serialization is visibly independent from production serializers.
  return { stringify: (value: unknown) => JSON.stringify(value) };
}

test('backlog rejects every canonical invariant at its boundary', () => {
  const cases: Array<[string, Record<string, unknown>, RegExp]> = [
    ['ID', { id: '101' }, /zero-padded/],
    ['folder shape', { folder: 'W101_Bad' }, /kebab-case/],
    ['folder ownership', { folder: 'W102-other' }, /numeric sequence/],
    ['kind', { kind: 'bug' }, /kind must/],
    ['title', { title: '' }, /non-empty string/],
    ['state', { state: 'done' }, /state must/],
    ['priority', { priority: 0 }, /positive integer/],
    ['maturity', { spec_maturity: 'unknown' }, /outlined or ready/],
    ['state maturity', { state: 'completed', spec_maturity: 'outlined' }, /must have spec_maturity ready/],
    ['dependencies', { depends_on: 'W100' }, /must be a list/],
    ['blockers', { blockers: {} }, /must be a list/]
  ];
  for (const [label, change, expected] of cases)
    assert.throws(() => parseBacklog(backlogWith(change)), expected, label);

  assert.throws(() => parseBacklog('{'), /invalid/);
  assert.throws(() => parseBacklog('[]'), /must be a mapping/);
  assert.throws(() => parseBacklog('{}'), /schema_version/);
  assert.throws(() => parseBacklog('{"schema_version":4,"work_items":{}}'), /must be a list/);
  assert.throws(
    () => parseBacklog(JSON.stringify({ schema_version: 4, work_items: [validBacklogItem, validBacklogItem] })),
    /duplicate/
  );
  for (const [blocker, expected] of [
    [null, /mapping/],
    [{ id: 'Bad', type: 'external_action', description: 'x', status: 'unresolved' }, /kebab-case/],
    [{ id: 'bad', type: 'other', description: 'x', status: 'unresolved' }, /type is invalid/],
    [{ id: 'bad', type: 'external_action', description: '', status: 'unresolved' }, /non-empty/],
    [{ id: 'bad', type: 'external_action', description: 'x', status: 'open' }, /status is invalid/]
  ] as Array<[unknown, RegExp]>)
    assert.throws(() => parseBacklog(backlogWith({ blockers: [blocker] })), expected);
});

function tasksWith(tasks: unknown[], workItem = 'W101') {
  return JSON.stringify({ schema_version: 3, work_item: workItem, tasks });
}

test('task lists enforce identity, dependencies, lifecycle and retired fields', () => {
  const task = { id: 'T001', title: 'First', state: 'pending', depends_on: [] };
  assert.deepEqual(parseTasksTyped(tasksWith([task])).tasks, [task]);
  assert.equal(qualifiedTaskId('W101', 'T001'), 'W101-T001');
  const cases: Array<[unknown[], RegExp]> = [
    [[{ ...task, id: '1' }], /zero-padded/],
    [[task, task], /duplicate/],
    [[{ ...task, title: '' }], /non-empty/],
    [[{ ...task, state: 'done' }], /state must/],
    [[{ ...task, depends_on: 'T002' }], /must be a list/],
    [[{ ...task, depends_on: ['bad'] }], /invalid task ID/],
    [[{ ...task, depends_on: ['T001'] }], /itself/],
    [[{ ...task, traceability: [] }], /retired/],
    [[{ ...task, provenance: 'manual' }], /legacy_migration/],
    [[{ ...task, provenance: 'legacy_migration' }], /completed migrated/],
    [[{ ...task, depends_on: ['T002'] }], /unknown task/],
    [
      [
        { ...task, depends_on: ['T002'] },
        { ...task, id: 'T002', depends_on: ['T001'] }
      ],
      /cycle/
    ],
    [[task, { ...task, id: 'T002', state: 'in_progress' }, { ...task, id: 'T003', state: 'in_progress' }], /Only one/]
  ];
  for (const [tasks, expected] of cases) assert.throws(() => parseTasksTyped(tasksWith(tasks)), expected);
  assert.throws(() => parseTasksTyped('{'), /invalid/);
  assert.throws(() => parseTasksTyped('[]'), /mapping/);
  assert.throws(
    () => parseTasksTyped(JSON.stringify({ schema_version: 1, work_item: 'W101', tasks: [] })),
    /schema_version/
  );
  assert.throws(() => parseTasksTyped(tasksWith([], 'bad')), /zero-padded/);
  assert.throws(() => parseTasksTyped(tasksWith([], 'W101'), { expectedWorkItem: 'W102' }), /expected W102/);
});

test('specifications and reviews enforce ownership and canonical metadata', () => {
  const metadata = {
    schema_version: 1,
    work_item: 'W101',
    title: 'Item',
    kind: 'feature',
    priority: 1,
    depends_on: [],
    blockers: [],
    maturity: 'outlined'
  };
  const spec = `---\n${JSON.stringify(metadata)}\n---\n# Work Item Specification\n`;
  assert.equal(parseSpecTyped(spec).metadata.work_item, 'W101');
  assert.equal(validateSpec(spec).valid, true);
  assert.throws(() => parseWorkItemSpec('body'), /frontmatter/);
  assert.throws(() => parseWorkItemSpec('---\n{\n---\n'), /invalid/);
  assert.throws(() => parseSpecTyped(spec, { expectedWorkItem: 'W102' }), /invalid schema_version or work_item/);
  for (const change of [{ title: '' }, { kind: 'bug' }, { priority: 0 }, { maturity: 'unknown' }]) {
    const invalid = `---\n${JSON.stringify({ ...metadata, ...change })}\n---\n`;
    assert.throws(() => parseWorkItemSpec(invalid), /invalid canonical metadata/);
  }
  for (const key of ['depends_on', 'blockers']) {
    const invalid = `---\n${JSON.stringify({ ...metadata, [key]: {} })}\n---\n`;
    assert.throws(() => parseWorkItemSpec(invalid), /must be a list/);
  }

  const pending = { schema_version: 1, work_item: 'W101', status: 'pending' };
  assert.deepEqual(parseReviewTyped(JSON.stringify(pending)), pending);
  assert.deepEqual(parseReviewTyped(stringifyReview(pending)), pending);
  for (const [value, expected] of [
    ['{', /invalid/],
    ['[]', /mapping/],
    [JSON.stringify({ ...pending, schema_version: 0 }), /schema_version/],
    [JSON.stringify({ ...pending, work_item: 'bad' }), /invalid work_item/],
    [JSON.stringify({ ...pending, status: 'done' }), /pending or approved/],
    [JSON.stringify({ ...pending, status: 'approved', reviewed_at: 'never' }), /must be ISO/]
  ] as Array<[string, RegExp]>)
    assert.throws(() => parseReview(value), expected);
  assert.throws(() => parseReviewTyped(JSON.stringify(pending), { expectedWorkItem: 'W102' }), /invalid work_item/);
});

test('specialized documents accept complete content and reject stale plan revisions', () => {
  const engineering = document(
    ENGINEERING_HEADINGS,
    'baseline:\n  profile: flow/readability-first@2\n  existing_code_policy: improve\n'
  );
  assert.deepEqual(validateEngineeringDocument(engineering).errors, []);
  assert.deepEqual(
    validatePrdDocument(
      document([
        '# Product Requirements',
        '## Purpose',
        '## Users',
        '## Scope',
        '## Requirements',
        '## Constraints',
        '## Non-goals'
      ])
    ).errors,
    []
  );
  const plan = document(
    PLAN_HEADINGS,
    `work_item: W101\nengineering_revision: ${documentRevision(engineering)}\nspec_revision: ${documentRevision('spec')}\n`
  );
  assert.deepEqual(
    validateImplementationPlan(plan, { workItem: 'W101', engineeringText: engineering, specText: 'spec' }).errors,
    []
  );
  assert.match(
    validateImplementationPlan(plan, { workItem: 'W102', engineeringText: 'changed', specText: 'spec' }).errors.join(
      ' '
    ),
    /different work item.*stale/
  );
});

test('backlog parsing and ordering preserve dependencies and reject invalid graphs', () => {
  const yaml = `schema_version: 4\nwork_items:\n  - id: W101\n    folder: W101-first\n    kind: feature\n    title: First\n    state: completed\n    priority: 1\n    spec_maturity: ready\n    depends_on: []\n    blockers: []\n  - id: W102\n    folder: W102-second\n    kind: technical\n    title: Second\n    state: pending\n    priority: 2\n    spec_maturity: outlined\n    depends_on: [W101]\n    blockers:\n      - id: waiting-input\n        type: external_action\n        description: Input\n        status: unresolved\n`;
  const backlog = parseBacklogTyped(yaml);
  assert.deepEqual(
    (topologicalOrder(backlog.work_items) as Array<{ id: string }>).map((item) => item.id),
    ['W101', 'W102']
  );
  assert.deepEqual(
    deriveExecutionStatus(backlog.work_items[1], new Map(backlog.work_items.map((item) => [item.id, item]))).status,
    'blocked'
  );
  assert.throws(() => parseBacklog(yaml.replace('depends_on: [W101]', 'depends_on: [W102]')), /depend on itself/);
});

test('gate parsing defaults optional properties and rejects invalid commands', () => {
  const gates = parseGates(
    'schema_version: 2\ngates:\n  - id: test-gate\n    kind: command\n    command: node --version\n'
  );
  assert.deepEqual(gates.gates[0].scope, {});
  assert.equal(gates.gates[0].blocking, true);
  assert.throws(() => parseGates('schema_version: 2\ngates:\n  - id: bad\n    kind: command\n'), /requires command/);
  for (const [text, expected] of [
    ['{', /invalid/],
    ['[]', /mapping/],
    ['schema_version: 1\ngates: []', /schema_version/],
    ['schema_version: 2\ngates: {}', /must be a list/],
    ['schema_version: 2\ngates: [bad]', /must be a mapping/],
    ['schema_version: 2\ngates: [{id: Bad, kind: builtin}]', /lower kebab-case/],
    ['schema_version: 2\ngates: [{id: one, kind: builtin}, {id: one, kind: builtin}]', /duplicate/],
    ['schema_version: 2\ngates: [{id: one, kind: other}]', /command or builtin/],
    ['schema_version: 2\ngates: [{id: one, kind: builtin, stage: other}]', /stage must/],
    ['schema_version: 2\ngates: [{id: one, kind: builtin, cost: extreme}]', /cost must/],
    ['schema_version: 2\ngates: [{id: one, kind: builtin, scope: []}]', /scope must/]
  ] as Array<[string, RegExp]>)
    assert.throws(() => parseGates(text), expected);
  assert.equal(
    parseGates('schema_version: 2\ngates: [{id: optional, kind: builtin, blocking: false}]').gates[0].blocking,
    false
  );
});
