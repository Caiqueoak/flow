import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { info } from '../shared/cli-io.mjs';
import { projectRoot } from '../shared/project-path.mjs';

const KINDS = new Set(['feature', 'technical', 'maintenance']);
const STATUSES = new Set(['completed', 'in_progress', 'pending', 'blocked']);

export class GraphValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GraphValidationError';
  }
}

function compareIds(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message) {
  throw new GraphValidationError(message);
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string.`);
  return value;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be a mapping.`);
  return value;
}

function parseBacklog(text) {
  const document = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length) fail(`BACKLOG.yaml is invalid: ${document.errors[0].message}`);
  const backlog = requireObject(document.toJS(), 'BACKLOG.yaml');
  if (backlog.schema_version !== 1) fail('BACKLOG.yaml schema_version must be 1.');
  requireString(backlog.source_of_truth, 'BACKLOG.yaml source_of_truth');
  if (!Array.isArray(backlog.work_items)) fail('BACKLOG.yaml work_items must be a list.');

  const ids = new Set();
  const items = backlog.work_items.map((raw, index) => {
    const label = `work_items[${index}]`;
    const item = requireObject(raw, label);
    const id = requireString(item.id, `${label}.id`);
    if (ids.has(id)) fail(`BACKLOG.yaml contains duplicate work-item ID '${id}'.`);
    ids.add(id);
    const folder = requireString(item.folder, `${label}.folder`);
    if (!KINDS.has(item.kind)) fail(`${label}.kind must be feature, technical, or maintenance.`);
    const title = requireString(item.title, `${label}.title`);
    if (!STATUSES.has(item.status)) fail(`${label}.status must be completed, in_progress, pending, or blocked.`);
    if (!Number.isInteger(item.priority) || item.priority < 1) fail(`${label}.priority must be a positive integer.`);
    if (!Array.isArray(item.depends_on)) fail(`${label}.depends_on must be a list.`);
    const dependencies = new Set();
    for (const dependency of item.depends_on) {
      requireString(dependency, `${label}.depends_on entry`);
      if (dependency === id) fail(`Work item '${id}' cannot depend on itself.`);
      if (dependencies.has(dependency)) fail(`Work item '${id}' lists dependency '${dependency}' more than once.`);
      dependencies.add(dependency);
    }
    return {
      id,
      folder,
      kind: item.kind,
      title,
      status: item.status,
      priority: item.priority,
      depends_on: [...dependencies]
    };
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const item of items) {
    for (const dependency of item.depends_on) {
      if (!byId.has(dependency)) fail(`Work item '${item.id}' depends on unknown work item '${dependency}'.`);
    }
  }
  return items;
}

function topology(items) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const remaining = new Map(items.map((item) => [item.id, item.depends_on.length]));
  const dependents = new Map(items.map((item) => [item.id, []]));
  for (const item of items) {
    for (const dependency of item.depends_on) dependents.get(dependency).push(item.id);
  }
  for (const ids of dependents.values()) ids.sort(compareIds);
  const ready = items
    .filter((item) => item.depends_on.length === 0)
    .map((item) => item.id)
    .sort(compareIds);
  const levels = new Map(ready.map((id) => [id, 0]));
  const orderedIds = [];
  while (ready.length) {
    const id = ready.shift();
    orderedIds.push(id);
    for (const dependent of dependents.get(id)) {
      levels.set(dependent, Math.max(levels.get(dependent) ?? 0, levels.get(id) + 1));
      const count = remaining.get(dependent) - 1;
      remaining.set(dependent, count);
      if (count === 0) {
        ready.push(dependent);
        ready.sort(compareIds);
      }
    }
  }
  if (orderedIds.length !== items.length) fail('BACKLOG.yaml work-item dependencies contain a cycle.');
  const ordered = orderedIds
    .map((id) => byId.get(id))
    .sort((left, right) => levels.get(left.id) - levels.get(right.id) || compareIds(left.id, right.id));
  return { ordered, byId };
}

function displayStatus(item, byId) {
  if (item.status === 'completed') return 'complete';
  if (item.status === 'in_progress') return 'active';
  const derived = item.depends_on.every((id) => byId.get(id).status === 'completed') ? 'pending' : 'blocked';
  if (item.status !== derived) fail(`Work item '${item.id}' is declared ${item.status} but derives as ${derived}.`);
  return derived;
}

function escapeMermaid(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CLASS_DEFINITIONS = [
  '  classDef complete fill:#dcfce7,stroke:#16a34a,color:#14532d;',
  '  classDef active fill:#dbeafe,stroke:#2563eb,color:#1e3a8a;',
  '  classDef pending fill:#fef3c7,stroke:#d97706,color:#78350f;',
  '  classDef blocked fill:#fee2e2,stroke:#dc2626,color:#7f1d1d;'
];
const LINK_STYLES = {
  complete: 'stroke:#16a34a,stroke-width:2px',
  active: 'stroke:#2563eb,stroke-width:3px',
  pending: 'stroke:#d97706,stroke-width:2px,stroke-dasharray:6 3',
  blocked: 'stroke:#dc2626,stroke-width:2px,stroke-dasharray:2 3'
};

export function generateGraphMarkdown(backlogText) {
  const items = parseBacklog(backlogText);
  const { ordered, byId } = topology(items);
  const statuses = new Map(ordered.map((item) => [item.id, displayStatus(item, byId)]));
  const edges = ordered.flatMap((source) =>
    ordered
      .filter((target) => target.depends_on.includes(source.id))
      .map((target) => ({ source: source.id, target: target.id, status: statuses.get(source.id) }))
  );
  const lines = [
    '# Work-item dependency graph',
    '',
    '## Status',
    '',
    '- <span style="color:#16a34a">Complete</span> — all work accepted.',
    '- <span style="color:#2563eb">In progress</span> — active delivery path.',
    '- <span style="color:#d97706">Pending</span> — all dependencies complete; ready to start.',
    '- <span style="color:#dc2626">Blocked</span> — one or more dependencies remain incomplete.',
    '',
    '```mermaid',
    "%%{init: {'flowchart': {'curve': 'linear', 'nodeSpacing': 32, 'rankSpacing': 54}} }%%",
    'flowchart TD'
  ];
  for (const item of ordered) lines.push(`  ${item.id}["${escapeMermaid(item.id)}<br/>${escapeMermaid(item.title)}"]`);
  lines.push('');
  for (const edge of edges) lines.push(`  ${edge.source} --> ${edge.target}`);
  lines.push('', ...CLASS_DEFINITIONS);
  for (const status of ['complete', 'active', 'pending', 'blocked']) {
    const ids = ordered.filter((item) => statuses.get(item.id) === status).map((item) => item.id);
    if (ids.length) lines.push(`  class ${ids.join(',')} ${status};`);
  }
  for (const status of ['complete', 'active', 'pending', 'blocked']) {
    const indices = edges
      .map((edge, index) => (edge.status === status ? index : null))
      .filter((index) => index !== null);
    if (indices.length) lines.push(`  linkStyle ${indices.join(',')} ${LINK_STYLES[status]};`);
  }
  lines.push(
    '```',
    '',
    'Cards in the same vertical rank have no dependency between them and can be',
    'worked in parallel. Arrow color and line style are inherited from the source',
    'card: solid green for complete, solid blue for active, dashed yellow for',
    'pending, and dotted red for blocked.',
    ''
  );
  return lines.join('\n');
}

export function writeGraph(root) {
  const flowDirectory = path.join(root, '.flow');
  const backlogPath = path.join(flowDirectory, 'BACKLOG.yaml');
  if (!fs.existsSync(backlogPath)) fail(`Backlog not found: ${backlogPath}`);
  const markdown = generateGraphMarkdown(fs.readFileSync(backlogPath, 'utf8'));
  const graphPath = path.join(flowDirectory, 'GRAPH.md');
  const temporaryPath = path.join(flowDirectory, `.GRAPH.md.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temporaryPath, markdown, 'utf8');
  fs.renameSync(temporaryPath, graphPath);
  return { graphPath, markdown };
}

export function runGraph({ args }) {
  const result = writeGraph(projectRoot(args));
  info(`Generated ${result.graphPath}`);
}
