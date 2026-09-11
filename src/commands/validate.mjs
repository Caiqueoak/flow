import fs from 'node:fs';
import path from 'node:path';
import { info, fail } from '../shared/cli-io.mjs';
import { projectRoot } from '../shared/project-path.mjs';
import { parseBacklog, deriveExecutionStatus } from '../artifacts/backlog.mjs';
import { parseTasks, qualifiedTaskId } from '../artifacts/tasks.mjs';
import { parseState } from '../artifacts/state.mjs';
import { parseGates } from '../artifacts/gates.mjs';
import { validateEngineeringDocument } from '../artifacts/engineering.mjs';
import { traceTask } from './trace.mjs';
import { generateGraphMarkdown } from './graph.mjs';
import { evaluateGates } from './gates.mjs';

function exists(file) { return fs.existsSync(file); }
function read(file) { return fs.readFileSync(file, 'utf8'); }

function validateLegacy(flowDir, findings) {
  for (const name of ['SUMMARY.md', 'DECISIONS.md', 'STATE.md', 'BACKLOG.yaml', 'GRAPH.md']) {
    if (exists(path.join(flowDir, name))) findings.push({ level: 'error', code: 'LEGACY', message: `Legacy artifact ${name} must be migrated.` });
  }
  const legacyWorkItems = path.join(flowDir, 'work-items');
  if (exists(legacyWorkItems)) {
    for (const entry of fs.readdirSync(legacyWorkItems, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!/^w\d{3,}-/.test(entry.name)) findings.push({ level: 'error', code: 'PATH', message: `Work-item folder '${entry.name}' must use w###-kebab-case.` });
      const folder = path.join(legacyWorkItems, entry.name);
      for (const old of ['SPEC.md', 'TASKS.yaml', 'DECISIONS.md']) if (exists(path.join(folder, old))) findings.push({ level: 'error', code: 'LEGACY', message: `${entry.name}/${old} uses legacy casing/artifact model.` });
      if (exists(path.join(folder, '__pycache__'))) findings.push({ level: 'error', code: 'GARBAGE', message: `${entry.name} contains __pycache__ under .flow.` });
    }
  }
}

function specRequirements(text, workItem, findings, { completed = false, agenticGates = [] } = {}) {
  const headings = ['## Status', '## Goal', '## Scope', '## Non-goals', '## Requirements', '## Acceptance criteria', '## Decisions'];
  for (const heading of headings) if (!text.includes(heading)) findings.push({ level: 'error', code: 'SPEC', message: `${workItem} spec.md is missing ${heading}.` });
  if (completed) {
    for (const heading of ['## Final outcome', '## Implementation', '## Validation']) if (!text.includes(heading)) findings.push({ level: 'error', code: 'SPEC', message: `${workItem} completed spec.md is missing ${heading}.` });
    for (const gate of agenticGates) {
      const evidence = new RegExp('^[-*]\\s+`?' + gate.id + '`?:\\s+passed(?:\\s|$)', 'mi');
      if (!evidence.test(text)) findings.push({ level: 'error', code: 'GATE_EVIDENCE', message: `${workItem} is completed but Validation lacks '${gate.id}: passed' agentic-gate evidence.` });
    }
  }
}

function engineeringRuleCoverage(engineeringText, gates, findings) {
  const engineering = validateEngineeringDocument(engineeringText);
  for (const error of engineering.errors) findings.push({ level: 'error', code: 'ENG', message: error });
  const gateIds = new Set(gates.gates.map((gate) => gate.id));
  const mappings = new Map();
  for (const match of engineeringText.matchAll(/^-\s+(ENG-[A-Z]+-\d{3,})\s*→\s*`?([a-z][a-z0-9-]*)`?\s*$/gm)) mappings.set(match[1], match[2]);
  for (const rule of engineering.rules) {
    const gate = mappings.get(rule.id);
    if (!gate) findings.push({ level: 'error', code: 'ENG004', message: `Engineering rule ${rule.id} has no enforcement mapping.` });
    else if (!gateIds.has(gate)) findings.push({ level: 'error', code: 'ENG005', message: `Engineering rule ${rule.id} references unknown gate '${gate}'.` });
  }
}

export function validateProject(root, { preCommitTask = null, skipTrace = false } = {}) {
  const findings = [];
  const flowDir = path.join(root, '.flow');
  if (!exists(flowDir)) return [{ level: 'error', code: 'FLOW', message: '.flow directory does not exist.' }];
  validateLegacy(flowDir, findings);

  const required = ['config.yaml', 'backlog.yaml', 'state.yaml', 'gates.yaml'];
  for (const name of required) if (!exists(path.join(flowDir, name))) findings.push({ level: 'error', code: 'MISSING', message: `Missing .flow/${name}.` });
  for (const name of ['prd.md', 'engineering.md', 'graph.md']) if (!exists(path.join(flowDir, 'docs', name))) findings.push({ level: 'error', code: 'MISSING', message: `Missing .flow/docs/${name}.` });
  if (findings.some((finding) => finding.code === 'MISSING')) return findings;

  let backlog;
  let gates;
  try { backlog = parseBacklog(read(path.join(flowDir, 'backlog.yaml'))); }
  catch (error) { findings.push({ level: 'error', code: 'BACKLOG', message: error.message }); return findings; }
  try { parseState(read(path.join(flowDir, 'state.yaml'))); }
  catch (error) { findings.push({ level: 'error', code: 'STATE', message: error.message }); }
  try { gates = parseGates(read(path.join(flowDir, 'gates.yaml'))); }
  catch (error) { findings.push({ level: 'error', code: 'GATES', message: error.message }); gates = { gates: [] }; }

  engineeringRuleCoverage(read(path.join(flowDir, 'docs', 'engineering.md')), gates, findings);

  const byId = new Map(backlog.work_items.map((item) => [item.id, item]));
  for (const item of backlog.work_items) {
    const folder = path.join(flowDir, 'work-items', item.folder);
    if (!exists(folder)) { findings.push({ level: 'error', code: 'WORK_ITEM', message: `${item.id} folder '${item.folder}' does not exist.` }); continue; }
    const specPath = path.join(folder, 'spec.md');
    const tasksPath = path.join(folder, 'tasks.yaml');
    if (!exists(specPath)) findings.push({ level: 'error', code: 'WORK_ITEM', message: `${item.id} is missing spec.md.` });
    else specRequirements(read(specPath), item.id, findings, { completed: item.state === 'completed', agenticGates: gates.gates.filter((gate) => gate.kind === 'agentic' && gate.blocking) });
    if (!exists(tasksPath)) { findings.push({ level: 'error', code: 'WORK_ITEM', message: `${item.id} is missing tasks.yaml.` }); continue; }
    let tasks;
    try { tasks = parseTasks(read(tasksPath), { expectedWorkItem: item.id }); }
    catch (error) { findings.push({ level: 'error', code: 'TASKS', message: error.message }); continue; }
    if (item.state === 'completed' && tasks.tasks.some((task) => task.state !== 'completed')) findings.push({ level: 'error', code: 'STATE', message: `${item.id} is completed but has incomplete tasks.` });
    for (const task of tasks.tasks) {
      if (task.state !== 'completed' || task.implementation === 'none' || skipTrace) continue;
      const qualified = qualifiedTaskId(item.id, task.id);
      if (preCommitTask === qualified) continue;
      try {
        const trace = traceTask(root, qualified);
        if (trace.status === 'missing') findings.push({ level: 'error', code: 'TRACE', message: `${qualified} is completed but has no reachable Flow-Task commit.` });
        if (trace.status === 'ambiguous') findings.push({ level: 'error', code: 'TRACE', message: `${qualified} is claimed by multiple reachable commits.` });
      } catch (error) {
        findings.push({ level: 'error', code: 'TRACE', message: `${qualified}: ${error.message}` });
      }
    }
    deriveExecutionStatus(item, byId);
  }

  if (!findings.some((finding) => ['GATES', 'MISSING'].includes(finding.code))) {
    try {
      for (const result of evaluateGates(root)) {
        if (result.blocking && ['failed', 'unsupported'].includes(result.status)) findings.push({ level: 'error', code: 'GATE', message: `Blocking gate '${result.id}' ${result.status}.` });
      }
    } catch (error) {
      findings.push({ level: 'error', code: 'GATE', message: error.message });
    }
  }

  const expectedGraph = generateGraphMarkdown(read(path.join(flowDir, 'backlog.yaml')));
  const actualGraph = read(path.join(flowDir, 'docs', 'graph.md'));
  if (expectedGraph !== actualGraph) findings.push({ level: 'error', code: 'GRAPH', message: 'docs/graph.md is stale; run flow graph.' });
  return findings;
}

export function runValidate({ args }) {
  const root = projectRoot(args);
  const preIndex = args.indexOf('--pre-commit');
  const preCommitTask = preIndex >= 0 ? args[preIndex + 1] : null;
  const findings = validateProject(root, { preCommitTask, skipTrace: args.includes('--skip-trace') });
  if (args.includes('--json')) {
    info(JSON.stringify({ valid: findings.length === 0, findings }, null, 2));
    if (findings.length) process.exitCode = 1;
    return;
  }
  if (!findings.length) return info('Flow project is valid.');
  for (const finding of findings) info(`${finding.level.toUpperCase()} ${finding.code}: ${finding.message}`);
  fail(`${findings.length} validation finding(s).`);
}
