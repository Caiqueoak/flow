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

const allStatusesItems = [
  ...items.map((item) => ({
    ...item,
    depends_on: item.id === 'W004' ? ['W001', ...item.depends_on] : [...item.depends_on]
  })),
  {
    id: 'W005',
    folder: 'W005-blocked-source',
    kind: 'maintenance',
    title: 'Blocked source',
    state: 'pending',
    priority: 2,
    depends_on: ['W004'],
    blockers: []
  },
  {
    id: 'W006',
    folder: 'W006-blocked-target',
    kind: 'maintenance',
    title: 'Blocked target',
    state: 'pending',
    priority: 3,
    depends_on: ['W005'],
    blockers: []
  }
];

function linkStyleForEdge(graph, source, target) {
  const edges = [...graph.matchAll(/^\s+(W\d+) --> (W\d+)$/gm)];
  const index = edges.findIndex((match) => match[1] === source && match[2] === target);
  assert.notEqual(index, -1, `Expected ${source} --> ${target} edge.`);
  const match = new RegExp(`^\\s+linkStyle ${index} (.+);$`, 'm').exec(graph);
  assert.ok(match, `Expected linkStyle ${index}.`);
  return match[1];
}

function dependencyEdges(graph) {
  return [...graph.matchAll(/^\s+(W\d+ --> W\d+)$/gm)].map((match) => match[1]);
}

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

test('emits exactly one contiguous linkStyle for every dependency edge', () => {
  const graph = generateGraphMarkdown(backlog(allStatusesItems));
  const edges = [...graph.matchAll(/^\s+W\d+ --> W\d+$/gm)];
  const linkStyles = [...graph.matchAll(/^\s+linkStyle (\d+) /gm)];
  assert.equal(linkStyles.length, edges.length);
  assert.deepEqual(
    linkStyles.map((match) => Number(match[1])),
    edges.map((_, index) => index)
  );
});

test('styles outgoing dependency edges for every source status', () => {
  const graph = generateGraphMarkdown(backlog(allStatusesItems));
  assert.equal(linkStyleForEdge(graph, 'W001', 'W002'), 'stroke:#16a34a,stroke-width:2px');
  assert.equal(linkStyleForEdge(graph, 'W002', 'W004'), 'stroke:#2563eb,stroke-width:3px');
  assert.equal(linkStyleForEdge(graph, 'W003', 'W004'), 'stroke:#d97706,stroke-width:2px,stroke-dasharray:6 4');
  assert.equal(linkStyleForEdge(graph, 'W005', 'W006'), 'stroke:#dc2626,stroke-width:2px,stroke-dasharray:2 3');
});

test('styles dependency edges from source status, not target status', () => {
  const graph = generateGraphMarkdown(backlog(allStatusesItems));
  assert.equal(linkStyleForEdge(graph, 'W001', 'W004'), 'stroke:#16a34a,stroke-width:2px');
});

test('changes only an outgoing edge style when its source status changes', () => {
  const completedSource = allStatusesItems.map((item) =>
    item.id === 'W002' ? { ...item, state: 'completed' } : { ...item, depends_on: [...item.depends_on] }
  );
  const inProgressGraph = generateGraphMarkdown(backlog(allStatusesItems));
  const completedGraph = generateGraphMarkdown(backlog(completedSource));
  assert.deepEqual(dependencyEdges(completedGraph), dependencyEdges(inProgressGraph));
  assert.equal(linkStyleForEdge(inProgressGraph, 'W002', 'W004'), 'stroke:#2563eb,stroke-width:3px');
  assert.equal(linkStyleForEdge(completedGraph, 'W002', 'W004'), 'stroke:#16a34a,stroke-width:2px');
});

test('renders the colored status legend', () => {
  const graph = generateGraphMarkdown(backlog(items));
  for (const status of ['🟩 **Completed**', '🟦 **In Progress**', '🟨 **Ready**', '🟥 **Blocked**'])
    assert.ok(graph.includes(status));
});

test('writes only docs/graph.md from lowercase backlog.yaml', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-graph-'));
  await fs.mkdir(path.join(root, '.flow'), { recursive: true });
  await fs.writeFile(path.join(root, '.flow', 'backlog.yaml'), backlog(items));
  const { graphPath } = writeGraph(root);
  assert.equal(graphPath, path.join(root, '.flow', 'docs', 'graph.md'));
  assert.match(await fs.readFile(graphPath, 'utf8'), /W002 --> W004/);
  const first = await fs.readFile(graphPath, 'utf8');
  writeGraph(root);
  assert.equal(await fs.readFile(graphPath, 'utf8'), first);
});

test('regenerates edge styles from changed backlog state', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-graph-state-'));
  const backlogPath = path.join(root, '.flow', 'backlog.yaml');
  await fs.mkdir(path.dirname(backlogPath), { recursive: true });
  await fs.writeFile(backlogPath, backlog(items));
  const before = writeGraph(root).markdown;
  const completedItems = items.map((item) => (item.id === 'W002' ? { ...item, state: 'completed' } : item));
  await fs.writeFile(backlogPath, backlog(completedItems));
  const after = writeGraph(root).markdown;
  assert.equal(linkStyleForEdge(before, 'W002', 'W004'), 'stroke:#2563eb,stroke-width:3px');
  assert.equal(linkStyleForEdge(after, 'W002', 'W004'), 'stroke:#16a34a,stroke-width:2px');
});

test('matches the canonical graph format', async () => {
  const fixture = new URL('./fixtures/graph/', import.meta.url);
  const [backlogText, expected] = await Promise.all([
    fs.readFile(new URL('canonical-backlog.yaml', fixture), 'utf8'),
    fs.readFile(new URL('canonical.graph.md', fixture), 'utf8')
  ]);
  assert.equal(generateGraphMarkdown(backlogText), expected);
});
