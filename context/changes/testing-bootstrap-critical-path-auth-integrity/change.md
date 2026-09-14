---
change_id: testing-bootstrap-critical-path-auth-integrity
title: Bootstrap test infra and lock down critical-path auth integrity
status: implemented
created: 2026-09-14
updated: 2026-09-14
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Bootstrap + critical-path auth integrity".
Risks covered: #1 (RLS doesn't lock what it was believed to lock — cross-account/cross-role data exposure), #2 (a plan is generated/viewable for a never-approved assessment), #4 (a one-way status transition gets reversed or re-entered after already being locked).
Test types planned: unit + integration.
Risk response intent:
- #1: prove a non-owner/non-manager request is rejected (read and write) for every RLS-protected table, tested directly against Supabase as different seeded users, not only through app routes.
- #2: prove triggering or viewing a plan for a draft/submitted (not-yet-approved) assessment is rejected end-to-end, testing the exact boundary transition, not just "assessment doesn't exist."
- #4: prove that once approved, no out-of-order or repeated call (approve twice, return an already-approved assessment) can transition an assessment backward or mutate its scores.
After creating the folder, follow the downstream continuation rule (suggest /10x-research next).
