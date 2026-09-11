export const AGENTIC_GATE_PROFILES = {
  'flow/maintainability@1': {
    id: 'flow/maintainability@1',
    purpose: 'Judge readability, cohesion, proportional complexity, and maintainable design.',
    criteria: [
      'Names communicate intent without requiring unnecessary comments.',
      'Functions and modules have cohesive responsibilities.',
      'Coupling and duplication are not introduced without justification.',
      'SOLID principles are used where they reduce coupling or clarify ownership, not dogmatically.',
      'No speculative abstraction exists without a concrete boundary or demonstrated variation.',
      'Control flow is straightforward and complexity is proportional to current/credible near-term requirements.',
      'The change follows the approved engineering contract.'
    ]
  },
  'flow/architecture-simplicity@1': {
    id: 'flow/architecture-simplicity@1',
    purpose: 'Reject architecture whose ongoing complexity is not justified by current or credible near-term needs.',
    criteria: [
      'Every added architectural mechanism solves a current requirement or credible near-term growth constraint.',
      'Mechanisms that can be safely added later without significant migration risk are deferred.',
      'Operational and cognitive cost does not exceed the migration/risk cost it avoids.',
      'Existing simple boundaries are preferred over new services, layers, repositories, factories, or buses unless justified.'
    ]
  }
};
