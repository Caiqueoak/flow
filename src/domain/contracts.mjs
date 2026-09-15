export const FLOW_SCHEMA_VERSION = 3;
export const BACKLOG_SCHEMA_VERSION = 3;
export const TASKS_SCHEMA_VERSION = 2;
export const STATE_SCHEMA_VERSION = 2;
export const GATES_SCHEMA_VERSION = 2;

export const WORK_ITEM_ID_PATTERN = '^W\\d{3,}$';
export const TASK_ID_PATTERN = '^T\\d{3,}$';
export const QUALIFIED_TASK_ID_PATTERN = '^W\\d{3,}-T\\d{3,}$';
export const WORK_ITEM_ID = new RegExp(WORK_ITEM_ID_PATTERN);
export const TASK_ID = new RegExp(TASK_ID_PATTERN);
export const QUALIFIED_TASK_ID = new RegExp(QUALIFIED_TASK_ID_PATTERN);

export const LIFECYCLE_STATES = Object.freeze(['pending', 'in_progress', 'completed']);
export const SPEC_MATURITIES = Object.freeze(['outlined', 'ready']);
export const TRACEABILITY_MODES = Object.freeze(['commit', 'none', 'legacy']);
export const WORKFLOW = Object.freeze({
  discovery: ['define_problem', 'explore_product', 'assess_viability', 'consolidate'],
  prd: ['draft', 'await_approval'],
  engineering: ['draft', 'await_approval'],
  backlog: ['outline', 'route'],
  specification: ['deepen', 'validate', 'promote'],
  planning: ['create_tasks', 'prepare_plan', 'await_approval'],
  implementation: ['start_task', 'execute_task', 'verify_task', 'persist_evidence'],
  review: ['review_work_item'],
  reconcile: ['resolve_conflicts'],
  complete: ['finished']
});

const id = (pattern, description) => ({ type: 'string', pattern, description });
export const JSON_SCHEMAS = Object.freeze({
  config: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://flow.local/schemas/config.schema.json',
    type: 'object',
    additionalProperties: false,
    required: ['schema_version', 'flow_version', 'runtimes', 'engineering'],
    properties: {
      schema_version: { const: FLOW_SCHEMA_VERSION },
      flow_version: { type: 'string' },
      runtimes: { type: 'array', items: { type: 'object' } },
      engineering: { type: 'object' }
    }
  },
  backlog: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://flow.local/schemas/backlog.schema.json',
    type: 'object',
    additionalProperties: false,
    required: ['schema_version', 'work_items'],
    properties: {
      schema_version: { const: BACKLOG_SCHEMA_VERSION },
      work_items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'folder', 'kind', 'title', 'state', 'priority', 'spec_maturity', 'depends_on', 'blockers'],
          properties: {
            id: id(WORK_ITEM_ID_PATTERN, 'Permanent work-item identifier.'),
            folder: { type: 'string', pattern: '^W\\d{3,}-[a-z0-9]+(?:-[a-z0-9]+)*$' },
            kind: { enum: ['feature', 'technical', 'maintenance'] },
            title: { type: 'string', minLength: 1 },
            state: { enum: LIFECYCLE_STATES },
            priority: { type: 'integer', minimum: 1 },
            spec_maturity: { enum: SPEC_MATURITIES },
            depends_on: { type: 'array', uniqueItems: true, items: id(WORK_ITEM_ID_PATTERN) },
            blockers: { type: 'array' }
          }
        }
      }
    }
  },
  tasks: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://flow.local/schemas/tasks.schema.json',
    type: 'object',
    required: ['schema_version', 'work_item', 'tasks'],
    properties: {
      schema_version: { const: TASKS_SCHEMA_VERSION },
      work_item: id(WORK_ITEM_ID_PATTERN),
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'title', 'state', 'depends_on', 'traceability'],
          properties: {
            id: id(TASK_ID_PATTERN),
            title: { type: 'string', minLength: 1 },
            state: { enum: LIFECYCLE_STATES },
            depends_on: { type: 'array', uniqueItems: true, items: id(TASK_ID_PATTERN) },
            traceability: { enum: TRACEABILITY_MODES },
            legacy_commit: { type: 'string', description: 'Read-only provenance for migrated completed tasks.' }
          }
        }
      }
    }
  },
  state: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://flow.local/schemas/state.schema.json',
    type: 'object',
    required: ['schema_version', 'execution', 'active', 'stop_reason', 'migration'],
    properties: {
      schema_version: { const: STATE_SCHEMA_VERSION },
      execution: { type: 'object' },
      active: { type: 'object' },
      stop_reason: { type: ['string', 'null'] },
      migration: { type: 'object' }
    }
  },
  gates: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://flow.local/schemas/gates.schema.json',
    type: 'object',
    required: ['schema_version', 'gates'],
    properties: { schema_version: { const: GATES_SCHEMA_VERSION }, gates: { type: 'array' } }
  }
});
