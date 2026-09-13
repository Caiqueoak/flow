import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { generateGraphMarkdown, writeGraph } from '../src/commands/graph.mjs';

function backlog(items) {
  return stringify({ schema_version: 2, work_items: items });
}
const items = [
  {
    id: 'W001',
    folder: 'W001-foundation',
    kind: 'feature',
    title: 'Foundation',
    state: 'completed',
    priority: 1,
    depends_on: [],
    blockers: []
  },
  {
    id: 'W002',
    folder: 'W002-api',
    kind: 'technical',
    title: 'API',
    state: 'in_progress',
    priority: 1,
    depends_on: ['W001'],
    blockers: []
  },
  {
    id: 'W003',
    folder: 'W003-ui',
    kind: 'feature',
    title: 'UI',
    state: 'pending',
    priority: 1,
    depends_on: ['W001'],
    blockers: []
  },
  {
    id: 'W004',
    folder: 'W004-integration',
    kind: 'feature',
    title: 'Integration',
    state: 'pending',
    priority: 2,
    depends_on: ['W002', 'W003'],
    blockers: []
  }
];

test('renders every dependency edge and derives ready/blocked without persisting blocked', () => {
  const graph = generateGraphMarkdown(backlog(items));
  for (const edge of ['W001 --> W002', 'W001 --> W003', 'W002 --> W004', 'W003 --> W004'])
    assert.match(graph, new RegExp(edge));
  assert.match(graph, /class W001 completed;/);
  assert.match(graph, /class W002 in_progress;/);
  assert.match(graph, /class W003 ready;/);
  assert.match(graph, /class W004 blocked;/);
  assert.match(graph, /Ready/);
  assert.match(graph, /Blocked/);
});

test('is deterministic independent of input ordering', () => {
  const shuffled = items
    .slice()
    .reverse()
    .map((item) => ({ ...item, depends_on: [...item.depends_on].reverse() }));
  assert.equal(generateGraphMarkdown(backlog(items)), generateGraphMarkdown(backlog(shuffled)));
});

test('writes only docs/graph.md from lowercase backlog.yaml', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-graph-'));
  await fs.mkdir(path.join(root, '.flow'), { recursive: true });
  await fs.writeFile(path.join(root, '.flow', 'backlog.yaml'), backlog(items));
  const { graphPath } = writeGraph(root);
  assert.equal(graphPath, path.join(root, '.flow', 'docs', 'graph.md'));
  assert.match(await fs.readFile(graphPath, 'utf8'), /W002 --> W004/);
});
