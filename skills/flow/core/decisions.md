# Human decisions

Ask the user only when their judgment materially changes product behavior, scope, public contracts, architecture, security/risk posture, irreversible operations, external ownership, cost, or feasibility.

When asking, provide:

- the decision context;

- the reasonable options;

- a recommendation;

- the reason for that recommendation;

- one focused question.

Do not ask the user to decide ordinary implementation details such as private naming, file placement within an approved topology, local refactors, implementation order, routine error handling, test organization, or library usage already covered by engineering.

Before stopping for a decision, ask:

- Does this materially change product, scope, contracts, architecture or risk?

- Is the answer already derivable from approved contracts?

- Can this safely be decided autonomously as a local implementation detail?

If existing contracts make one option safe and consistent, choose it and continue.
