export const ENGINEERING_PROFILES = {
  pragmatic: {
    id: 'flow/pragmatic@1',
    label: 'Pragmatic — Recommended',
    description: 'Production-minded readability, testing and automated quality checks without unjustified architecture.',
    principles: {
      simplicity_bias: 'strong',
      readability_over_cleverness: true,
      speculative_abstraction: 'reject',
      automated_enforcement: 'prefer',
      type_safety: 'strong',
      behavior_tests: 'required'
    }
  },
  strict: {
    id: 'flow/strict@1',
    label: 'Strict',
    description: 'Stronger architectural boundaries and verification for larger or long-lived systems.',
    principles: {
      simplicity_bias: 'moderate',
      readability_over_cleverness: true,
      speculative_abstraction: 'reject',
      automated_enforcement: 'require',
      type_safety: 'strong',
      behavior_tests: 'required'
    }
  },
  prototype: {
    id: 'flow/prototype@1',
    label: 'Prototype',
    description: 'Minimal structure for rapid validation while retaining baseline safety and deterministic formatting.',
    principles: {
      simplicity_bias: 'maximum',
      readability_over_cleverness: true,
      speculative_abstraction: 'reject',
      automated_enforcement: 'baseline',
      type_safety: 'ecosystem_default',
      behavior_tests: 'critical_paths'
    }
  }
};

export const BROWNFIELD_POLICIES = {
  rebaseline: {
    label: 'Rebaseline — Recommended for AI/vibe-coded projects',
    description: 'Existing code is evidence of behavior and constraints, not an engineering standard.'
  },
  preserve: {
    label: 'Preserve',
    description: 'Consistent existing patterns are presumed intentional unless they conflict with stronger requirements.'
  }
};
