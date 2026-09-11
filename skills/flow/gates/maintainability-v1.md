# flow/maintainability@1

Blocking judgment gate for code changes.

Pass only when all are true:
- names communicate intent;
- functions/modules remain cohesive;
- coupling and duplication are justified and minimized;
- SOLID is applied where it reduces coupling or clarifies ownership, not as ceremony;
- no speculative abstraction exists without a concrete boundary or demonstrated variation;
- control flow is straightforward;
- complexity is proportional to current requirements and credible near-term growth;
- the approved engineering contract is followed.

A failure must name the concrete harm and smallest corrective direction. Do not fail merely because another style is possible.
