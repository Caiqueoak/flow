import { GATES_SCHEMA_VERSION } from '../gate/gate.js';
import { FLOW_SCHEMA_VERSION } from './project.js';
import { LIFECYCLE_STATES, TASK_ID_PATTERN, TASKS_SCHEMA_VERSION } from '../task/task.js';
import {
  BACKLOG_SCHEMA_VERSION,
  BLOCKER_STATUSES,
  BLOCKER_TYPES,
  DERIVED_WORK_ITEM_STATES,
  REVIEW_SCHEMA_VERSION,
  SPEC_MATURITIES,
  WORK_ITEM_ID_PATTERN,
  WORK_ITEM_KINDS
} from '../work-item/work-item.js';

const id = (pattern: string, description?: string) => ({
  type: 'string',
  pattern,
  ...(description ? { description } : {})
});

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
            kind: { enum: WORK_ITEM_KINDS },
            title: { type: 'string', minLength: 1 },
            outcome: { type: 'string', minLength: 1 },
            state: { enum: DERIVED_WORK_ITEM_STATES },
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
          required: ['id', 'title', 'state', 'depends_on'],
          properties: {
            id: id(TASK_ID_PATTERN),
            title: { type: 'string', minLength: 1 },
            state: { enum: LIFECYCLE_STATES },
            depends_on: { type: 'array', uniqueItems: true, items: id(TASK_ID_PATTERN) },
            provenance: { enum: ['legacy_migration'] },
            legacy_commit: { type: 'string', description: 'Read-only provenance for migrated completed tasks.' }
          }
        }
      }
    }
  },
  review: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://flow.local/schemas/review.schema.json',
    type: 'object',
    required: ['schema_version', 'work_item', 'status'],
    properties: {
      schema_version: { const: REVIEW_SCHEMA_VERSION },
      work_item: id(WORK_ITEM_ID_PATTERN),
      status: { enum: ['pending', 'approved'] },
      reviewed_at: { type: 'string' }
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

export { BLOCKER_STATUSES, BLOCKER_TYPES };
