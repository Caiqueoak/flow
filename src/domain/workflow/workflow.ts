export const STATE_SCHEMA_VERSION = 2;

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
