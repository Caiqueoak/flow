# Experience approval

Present the consequential experience contract and ask for explicit human approval of the current document.

After approval run:

`flow approval record _flow/docs/experience.md`

The approval is bound to the current normalized document revision. A matching approval-ready checkpoint is cleared only when it targets that same revision. If the user requests changes, keep the document draft, update the checkpoint and re-present it. Route again after approval.
