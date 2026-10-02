# Engineering approval

Present the recommendation macro to micro, concrete organization and naming examples, verification, tradeoffs, deferred complexity and exceptions. Ask explicit human approval of the current engineering revision.

After approval run:

`flow approval record _flow/docs/engineering.md`

The runtime records the exact normalized approval revision and clears a matching approval-ready checkpoint only for that same revision. Any later material engineering edit invalidates downstream authorization until the new revision is approved. Never inherit approval from a profile or legacy engineering file.

Route again after approval to continue backlog planning.
