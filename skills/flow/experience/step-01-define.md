# Experience — define the minimum useful contract

Enter this phase only when the exact-approved PRD records `experience: required`.

Resume a matching checkpoint targeting `_flow/docs/experience.md` when one exists. Otherwise begin one before consequential experience decisions. Persist meaningful decision batches with `flow checkpoint update --data <json>`; keep the checkpoint compact and do not copy the document into state.

Choose the smallest useful experience artifact for this product. The canonical document may contain the useful subset of:

- journeys and interactions;
- screen or information-architecture structure;
- loading, empty, error and success behavior;
- responsive and accessibility constraints;
- visual/component direction;
- wireframe or prototype references.

Prototypes, mockups and wireframes are supporting specification-by-example, never canonical runtime state.

Materialize `_flow/docs/experience.md` with:

- `schema_version: 2`;
- `status: draft`;
- `# Experience`;
- only the experience detail justified by the product.

When all consequential experience dimensions are resolved, run `flow checkpoint ready`. The runtime derives and records the current exact document revision. Then route to explicit approval.
