const common = [{ name: '--path', value: '<project>', description: 'Project root (default: current directory).' }];

export const COMMANDS = Object.freeze([
  {
    name: 'init',
    description: 'Initialize Flow or refresh runtime integrations.',
    usage: 'flow init [options]',
    flags: [
      ...common,
      { name: '--runtime', value: '<list>' },
      { name: '--profile', value: '<id>', default: 'readability-first' },
      { name: '--existing-code', value: '<policy>', values: ['improve', 'preserve'] }
    ],
    effects: 'Writes config and runtime skills.',
    when: 'Once per project and after an explicit package update.',
    load: () => import('../commands/init.mjs'),
    run: 'runInit'
  },
  {
    name: 'doctor',
    description: 'Diagnose versions, artifacts, schemas and integrations without writing.',
    usage: 'flow doctor [--quick] [--json]',
    flags: [...common, { name: '--quick' }, { name: '--json' }],
    effects: 'Read-only.',
    when: 'At every /flow start with --quick --json, or before migration.',
    load: () => import('../commands/doctor.mjs'),
    run: 'runDoctor'
  },
  {
    name: 'migrate',
    description: 'Plan or apply deterministic, recoverable structural migrations.',
    usage: 'flow migrate --plan|--apply [--json]',
    flags: [...common, { name: '--plan' }, { name: '--apply' }, { name: '--json' }],
    effects: '--plan is read-only; --apply uses validated staging and a recoverable backup.',
    when: 'After doctor reports an artifact version mismatch.',
    load: () => import('../commands/migrate.mjs'),
    run: 'runMigrate'
  },
  {
    name: 'status',
    description: 'Show persisted progress and derived eligibility/blocking.',
    usage: 'flow status [--json]',
    flags: [...common, { name: '--json' }],
    effects: 'Read-only.',
    when: 'To inspect progress.',
    load: () => import('../commands/status.mjs'),
    run: 'runStatus'
  },
  {
    name: 'validate',
    description: 'Run fast structural validation; gates are opt-in.',
    usage: 'flow validate [--work-item W###] [--gates] [--json]',
    flags: [
      ...common,
      { name: '--work-item', value: '<W###>' },
      { name: '--gates' },
      { name: '--pre-commit', value: '<W###-T###>' },
      { name: '--skip-trace' },
      { name: '--json' }
    ],
    effects: 'Read-only; --gates may execute configured processes.',
    when: 'After structured changes and before commits.',
    load: () => import('../commands/validate.mjs'),
    run: 'runValidate'
  },
  {
    name: 'route',
    description: 'Resolve the next legal workflow step and safe validation scope.',
    usage: 'flow route [--json]',
    flags: [...common, { name: '--json' }],
    effects: 'Read-only.',
    when: 'After doctor and every completed workflow step.',
    load: () => import('../commands/route.mjs'),
    run: 'runRoute'
  },
  {
    name: 'sync',
    description: 'Materialize disposable projections from canonical work-items.',
    usage: 'flow sync',
    flags: common,
    effects: 'Reads only canonical work-items; writes _flow/generated/ only.',
    when: 'After canonical work-item changes.',
    load: () => import('../commands/sync.mjs'),
    run: 'runSync'
  },
  {
    name: 'trace',
    description: 'Resolve a permanent task ID against reachable Git history.',
    usage: 'flow trace W###[-T###] [--json]',
    arguments: [{ name: 'identity', required: true, description: 'Task W###-T### or aggregate work-item W###.' }],
    flags: [...common, { name: '--json' }],
    effects: 'Read-only Git inspection.',
    when: 'After task completion and during review.',
    load: () => import('../commands/trace.mjs'),
    run: 'runTrace'
  },
  {
    name: 'gates',
    description: 'List or selectively run deterministic project gates.',
    usage: 'flow gates list|run [filters]',
    arguments: [{ name: 'action', required: true }],
    flags: [
      ...common,
      { name: '--id', value: '<gate-id>' },
      { name: '--task', value: '<W###-T###>' },
      { name: '--work-item', value: '<W###>' },
      { name: '--stage', value: '<stage>', values: ['task', 'work-item-review', 'full'] },
      { name: '--all' },
      { name: '--json' }
    ],
    effects: 'list is read-only; run executes selected commands.',
    when: 'For the smallest safe verification scope.',
    load: () => import('../commands/gates.mjs'),
    run: 'runGates'
  },
  {
    name: 'work-item',
    description: 'Create or deterministically update backlog work-items.',
    usage: 'flow work-item <create|set|priority|dependencies|blocker-add|blocker-resolve|promote|review-complete> ...',
    arguments: [{ name: 'operation', required: true }],
    flags: [
      ...common,
      { name: '--title', value: '<text>' },
      { name: '--kind', value: '<kind>', values: ['feature', 'technical', 'maintenance'] },
      { name: '--priority', value: '<integer>' },
      { name: '--depends-on', value: '<W###,...>' },
      { name: '--id', value: '<blocker-id>' },
      { name: '--type', value: '<type>', values: ['external_action', 'consequential_decision'] },
      { name: '--description', value: '<text>' },
      { name: '--domain', value: '<domain>' }
    ],
    effects: 'Writes only artifacts in the target work-item folder.',
    when: 'For deterministic backlog mutations.',
    load: () => import('../commands/operations.mjs'),
    run: 'runWorkItem'
  },
  {
    name: 'task',
    description: 'Create, update, start or commit tasks.',
    usage: 'flow task <create|set|start|commit> W###[-T###] [options]',
    arguments: [{ name: 'operation', required: true }],
    flags: [
      ...common,
      { name: '--title', value: '<text>' },
      { name: '--depends-on', value: '<T###,...>' },
      { name: '--message', value: '<objective commit title>' }
    ],
    effects: 'Task commit creates the one canonical implementation commit.',
    when: 'Only after spec maturity is ready.',
    load: () => import('../commands/operations.mjs'),
    run: 'runTask'
  },
  {
    name: 'approval',
    description: 'Persist an explicit human approval for a document revision.',
    usage: 'flow approval record <path> [--at <ISO timestamp>]',
    arguments: [{ name: 'operation', required: true }],
    flags: [...common, { name: '--at', value: '<timestamp>' }],
    effects: 'Updates approved frontmatter.',
    when: 'Only after explicit approval of the exact document.',
    load: () => import('../commands/operations.mjs'),
    run: 'runApproval'
  },
  {
    name: 'batch',
    description: 'Apply a YAML/JSON transaction after validating every operation.',
    usage: 'flow batch --file <path>|--stdin [--format yaml|json]',
    flags: [
      ...common,
      { name: '--file', value: '<path>' },
      { name: '--stdin' },
      { name: '--format', value: '<format>', values: ['yaml', 'json'] }
    ],
    effects: 'Atomically writes all affected artifacts or none.',
    when: 'For multiple deterministic mutations.',
    load: () => import('../commands/operations.mjs'),
    run: 'runBatch'
  },
  {
    name: 'scope',
    description: 'Validate the staged scope for one task before its implementation commit.',
    usage: 'flow scope validate W###-T### [--json]',
    arguments: [{ name: 'operation', required: true }],
    flags: [...common, { name: '--json' }],
    effects: 'Read-only staged Git inspection and structural validation.',
    when: 'Immediately before a task implementation commit.',
    load: () => import('../commands/operations.mjs'),
    run: 'runScope'
  },
  {
    name: 'schemas',
    description: 'Generate JSON Schemas from central contracts.',
    usage: 'flow schemas',
    flags: [],
    effects: 'Writes package schemas.',
    when: 'Build/release.',
    load: () => import('../commands/schemas.mjs'),
    run: 'runSchemas',
    hidden: true
  }
]);

export const commandByName = (name) => COMMANDS.find((command) => command.name === name);
export function renderGlobalHelp(version) {
  const rows = COMMANDS.filter((command) => !command.hidden).map(
    (command) => `  ${command.name.padEnd(11)} ${command.description}`
  );
  return `Flow ${version}\n\nUsage: npx --no-install flow <command> [options]\nEngineering baseline: Readability First.\n\nGlobal parameters:\n  --help, -h       Show help.\n  --version, -v    Show package version.\n  --path <project> Select project root (default: current directory).\n\nCommands:\n${rows.join('\n')}\n\nRun flow <command> --help for syntax, values, effects and usage guidance.`;
}
export function renderCommandHelp(command) {
  const argumentsText = command.arguments?.length
    ? command.arguments
        .map(
          (argument) =>
            `  ${argument.name}${argument.required ? ' (required)' : ''} — ${argument.description ?? 'Command argument.'}`
        )
        .join('\n')
    : '  (none)';
  const flags = command.flags?.length
    ? command.flags
        .map(
          (flag) =>
            `  ${flag.name}${flag.value ? ` ${flag.value}` : ''}${flag.values ? ` (${flag.values.join('|')})` : ''}${flag.default ? ` [default: ${flag.default}]` : ''} — ${flag.description ?? 'Command option.'}`
        )
        .join('\n')
    : '  (none)';
  return `${command.description}\n\nSyntax:\n  ${command.usage}\n\nArguments:\n${argumentsText}\n\nOptions:\n${flags}\n\nEffects:\n  ${command.effects}\n\nUse when:\n  ${command.when}`;
}
export function validateCommandArguments(command, args) {
  const allowed = new Map((command.flags ?? []).map((flag) => [flag.name, flag]));
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith('-')) {
      positional.push(value);
      continue;
    }
    const flag = allowed.get(value);
    if (!flag) throw new Error(`unknown option '${value}' for flow ${command.name}.`);
    if (flag.value) {
      const next = args[++index];
      if (!next || next.startsWith('-')) throw new Error(`${value} requires ${flag.value}.`);
      if (flag.values && !flag.values.includes(next))
        throw new Error(`${value} must be one of: ${flag.values.join(', ')}.`);
    }
  }
  if (command.name === 'migrate' && args.includes('--plan') === args.includes('--apply'))
    throw new Error('flow migrate requires exactly one of --plan or --apply.');
  if (command.name === 'batch' && args.includes('--file') === args.includes('--stdin'))
    throw new Error('flow batch requires exactly one of --file or --stdin.');
  if (command.arguments?.some((argument) => argument.required) && !positional.length)
    throw new Error(`flow ${command.name} requires ${command.arguments[0].name}.`);
}
