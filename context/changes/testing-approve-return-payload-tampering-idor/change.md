---
change_id: testing-approve-return-payload-tampering-idor
title: Approve/return payload tampering and IDOR test coverage
status: planned
created: 2026-09-14
updated: 2026-09-14
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Approve/return payload tampering & IDOR".
Risks covered: #3. Test types planned: integration.
Risk response intent: #3: prove that an approve/return request carrying extra fields (e.g. a `score`) cannot alter anything beyond its intended column, and a request referencing another user's assessment/plan ID is rejected; must challenge the assumption that "the zod schema on the request body is the only defense" — verify the actual DB write payload construction, not just input validation; avoid the anti-pattern of only testing a well-formed payload that succeeds, never one with unexpected/extra fields.
