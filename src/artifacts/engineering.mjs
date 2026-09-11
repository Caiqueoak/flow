const REQUIRED_DIMENSIONS = [
  'system_shape',
  'module_architecture',
  'code_organization',
  'data_and_state',
  'external_boundaries',
  'conventions',
  'principles',
  'quality',
  'operations',
  'enforcement'
];
const DIMENSION_STATES = new Set(['defined', 'not_applicable', 'deferred']);

export function parseEngineeringFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { status: null, scope: new Map(), rules: [] };
  const lines = match[1].split('\n');
  let status = null;
  let inScope = false;
  const scope = new Map();
  for (const line of lines) {
    const statusMatch = line.match(/^status:\s*(\S+)/);
    if (statusMatch) status = statusMatch[1];
    if (/^scope:\s*$/.test(line)) { inScope = true; continue; }
    if (inScope) {
      const scoped = line.match(/^\s{2}([a-z_]+):\s*(\S+)/);
      if (scoped) scope.set(scoped[1], scoped[2]);
      else if (/^[^\s]/.test(line)) inScope = false;
    }
  }
  const rules = [...text.matchAll(/^###\s+(ENG-[A-Z]+-\d{3,})\s+—\s+(.+)$/gm)].map((m) => ({ id: m[1], title: m[2] }));
  return { status, scope, rules };
}

export function validateEngineeringDocument(text) {
  const parsed = parseEngineeringFrontmatter(text);
  const errors = [];
  if (parsed.status !== 'approved') errors.push('engineering.md status must be approved before normal implementation.');
  for (const dimension of REQUIRED_DIMENSIONS) {
    const state = parsed.scope.get(dimension);
    if (!DIMENSION_STATES.has(state)) errors.push(`engineering.md scope.${dimension} must be defined, not_applicable, or deferred.`);
  }
  const seen = new Set();
  for (const rule of parsed.rules) {
    if (seen.has(rule.id)) errors.push(`engineering.md contains duplicate rule ID ${rule.id}.`);
    seen.add(rule.id);
  }
  return { ...parsed, errors };
}
