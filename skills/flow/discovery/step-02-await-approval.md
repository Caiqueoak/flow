# PRD approval

Present the complete product proposal and consequential open questions. Ask explicit human approval of the current PRD revision. Do not proceed downstream until approved.

After approval run:

`flow approval record _flow/docs/prd.md`

The runtime records `status: approved` plus `approval.at` and the exact normalized `approval.revision`. A matching approval-ready checkpoint is cleared only for that same revision. Any later material edit invalidates authorization automatically. If revisions are requested, keep the document draft, update the checkpoint and re-present it.

Route again after approval. The approved PRD's `experience: required|not_required` value decides whether experience runs before engineering.
