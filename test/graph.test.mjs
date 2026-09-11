import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { stringify } from 'yaml';
import { GraphValidationError, generateGraphMarkdown, writeGraph } from '../src/commands/graph.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'src', 'cli.mjs');

async function project() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-graph-'));
  await fs.mkdir(path.join(directory, '.flow'));
  return directory;
}

function backlog(items) {
  return stringify({ schema_version: 1, source_of_truth: '.flow/', work_items: items });
}

const representativeItems = [
  {
    id: 'F001',
    folder: '001F-foundation',
    kind: 'feature',
    title: 'Foundation',
    status: 'completed',
    priority: 1,
    depends_on: []
  },
  {
    id: 'T002',
    folder: '002T-active',
    kind: 'technical',
    title: 'Active work',
    status: 'in_progress',
    priority: 1,
    depends_on: ['F001']
  },
  {
    id: 'F003',
    folder: '003F-ready',
    kind: 'feature',
    title: 'Ready work',
    status: 'pending',
    priority: 1,
    depends_on: ['F001']
  },
  {
    id: 'M004',
    folder: '004M-blocked',
    kind: 'maintenance',
    title: 'Blocked by active work',
    status: 'blocked',
    priority: 2,
    depends_on: ['T002']
  },
  {
    id: 'F005',
    folder: '005F-downstream',
    kind: 'feature',
    title: 'Downstream',
    status: 'blocked',
    priority: 3,
    depends_on: ['F003', 'M004']
  }
];

test('renders a stable complete graph with the established straight-arrow styling', () => {
  const graph = generateGraphMarkdown(backlog(representativeItems));
  assert.match(graph, /# Work-item dependency graph/);
  assert.match(graph, /'curve': 'linear'/);
  assert.doesNotMatch(graph, /curve': '(?!linear)/);
  for (const item of representativeItems)
    assert.match(graph, new RegExp(`${item.id}\\["${item.id}<br/>${item.title}"\\]`));
  for (const edge of ['F001 --> F003', 'F001 --> T002', 'F003 --> F005', 'T002 --> M004', 'M004 --> F005'])
    assert.match(graph, new RegExp(edge));
  assert.match(graph, /class F001 complete;/);
  assert.match(graph, /class T002 active;/);
  assert.match(graph, /class F003 pending;/);
  assert.match(graph, /class M004,F005 blocked;/);
  assert.match(graph, /linkStyle 0,1 stroke:#16a34a,stroke-width:2px;/);
  assert.match(graph, /linkStyle 3 stroke:#2563eb,stroke-width:3px;/);
  assert.match(graph, /linkStyle 2 stroke:#d97706,stroke-width:2px,stroke-dasharray:6 3;/);
  assert.match(graph, /linkStyle 4 stroke:#dc2626,stroke-width:2px,stroke-dasharray:2 3;/);
});

test('is deterministic when work items and dependency lists are reordered', () => {
  const shuffled = representativeItems
    .slice()
    .reverse()
    .map((item) => ({ ...item, depends_on: [...item.depends_on].reverse() }));
  assert.equal(generateGraphMarkdown(backlog(representativeItems)), generateGraphMarkdown(backlog(shuffled)));
});

test('writes through the public CLI and remains idempotent', async () => {
  const directory = await project();
  const source = backlog(representativeItems);
  await fs.writeFile(path.join(directory, '.flow', 'BACKLOG.yaml'), source);
  const first = await execFileAsync(process.execPath, [cli, 'graph', '--path', directory]);
  assert.match(first.stdout, /Generated/);
  const graphPath = path.join(directory, '.flow', 'GRAPH.md');
  const firstGraph = await fs.readFile(graphPath, 'utf8');
  await execFileAsync(process.execPath, [cli, 'graph', '--path', directory]);
  assert.equal(await fs.readFile(graphPath, 'utf8'), firstGraph);
});

test('renders large layered DAGs without omitting nodes or edges', () => {
  const items = Array.from({ length: 120 }, (_, index) => {
    const id = `F${String(index + 1).padStart(3, '0')}`;
    return {
      id,
      folder: `${String(index + 1).padStart(3, '0')}F-item`,
      kind: 'feature',
      title: `Item ${index + 1}`,
      status: index === 119 ? 'pending' : 'completed',
      priority: 1,
      depends_on: index === 0 ? [] : [`F${String(index).padStart(3, '0')}`]
    };
  });
  const graph = generateGraphMarkdown(backlog(items));
  assert.equal((graph.match(/\["F\d{3}<br\/>(?:Item) \d+"\]/g) || []).length, 120);
  assert.equal((graph.match(/ --> /g) || []).length, 119);
  assert.match(graph, /F120\["F120<br\/>Item 120"\]/);
});

test('rejects malformed graphs and preserves a valid projection on failure', async () => {
  const directory = await project();
  const backlogPath = path.join(directory, '.flow', 'BACKLOG.yaml');
  const graphPath = path.join(directory, '.flow', 'GRAPH.md');
  await fs.writeFile(backlogPath, backlog(representativeItems));
  writeGraph(directory);
  const previous = await fs.readFile(graphPath, 'utf8');

  const invalidCases = [
    'schema_version: [',
    backlog([{ ...representativeItems[0], status: 'unknown' }]),
    backlog([{ ...representativeItems[0], depends_on: ['MISSING'] }]),
    backlog([{ ...representativeItems[0], depends_on: ['F001'] }]),
    backlog([{ ...representativeItems[0] }, { ...representativeItems[1], depends_on: ['F001', 'F001'] }]),
    backlog([{ ...representativeItems[0], depends_on: ['T002'] }, representativeItems[1]]),
    backlog([
      { ...representativeItems[0], id: 'F001' },
      { ...representativeItems[0], id: 'F001' }
    ]),
    backlog([{ ...representativeItems[0], status: 'blocked' }])
  ];
  for (const invalid of invalidCases) {
    await fs.writeFile(backlogPath, invalid);
    assert.throws(() => writeGraph(directory), GraphValidationError);
    assert.equal(await fs.readFile(graphPath, 'utf8'), previous);
  }
});
