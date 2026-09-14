---
date: 2026-09-14T15:29:34+0000
researcher: Claude (10x-research)
git_commit: 3f4ddb136032c995bd9a6322096e87af58258733
branch: master
repository: maciej-z/SkillManager
topic: "Ground rollout Phase 1 of test-plan.md — RLS integrity, approval guardrail, status-lock invariants (Risks #1, #2, #4)"
tags: [research, codebase, rls, supabase, auth, assessments, development-plans]
status: complete
last_updated: 2026-09-14
last_updated_by: Claude (10x-research)
---

# Research: Bootstrap + critical-path auth integrity (test-plan Phase 1)

**Date**: 2026-09-14T15:29:34+0000
**Researcher**: Claude (10x-research)
**Git Commit**: 3f4ddb136032c995bd9a6322096e87af58258733
**Branch**: master
**Repository**: maciej-z/SkillManager

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` ("Bootstrap + critical-path auth integrity") against the current codebase. Verify Risks #1 (RLS doesn't lock what it was believed to lock), #2 (a plan is generated/viewable for a never-approved assessment), and #4 (a one-way status transition gets reversed or re-entered) — ground the real failure path, quote code, verify or correct the plan's response guidance, and confirm the test-infra starting point.

## Summary

**Risk #4 is not just theoretical — it is a live, exploitable gap.** `assessments_update_own_draft_only`'s RLS `WITH CHECK` clause (`supabase/migrations/20260913150000_employee_self_assessment.sql:43-46`) constrains only `employee_id = auth.uid()`, never the target `status`. An employee holding a `draft` assessment can issue a direct Supabase/PostgREST `UPDATE assessments SET status = 'approved', reviewed_by = <self>, reviewed_at = now() WHERE id = <own row>` and it satisfies both USING (row is still `draft` at check time) and WITH CHECK (still their own row) — self-approving without ever passing through `submitted` or leader review. The route layer (`submit.ts`) explicitly documents RLS as "the real enforcement boundary" here and adds no independent status restriction, and no service-role/RLS-bypass client exists anywhere in `src/` (confirmed by grep) — so RLS genuinely is the only gate, and it doesn't hold. Once `approved`, the row is permanently unreachable by either lock policy (terminal, but reached by the wrong path).

**This directly chains into Risk #2**: `development_plans_insert`/`development_plan_gaps_insert` (current versions) correctly gate on `assessments.status = 'approved'`, but they trust that status value — they have no way to know whether a leader actually set it. So an employee can self-approve their own draft, then successfully call `POST /api/plans/[assessmentId]/generate`, producing a real development plan for an assessment a leader never reviewed. The plan-generation route's own "approved-only" check (`generate.ts:50-52`) is correctly implemented and would reject a `submitted` assessment (409) — it is not itself buggy. The bypass happens one layer upstream, at the `assessments` RLS boundary.

A second, lower-severity finding: `development_plans_select` and `development_plan_gaps_select` (`supabase/migrations/20260914090000_ai_development_plan.sql:35-44, 82-92`) never check `assessments.status = 'approved'`, unlike their sibling INSERT/UPDATE policies (one of which — `development_plan_gaps_insert` — had exactly this omission caught and fixed by a follow-up migration, `20260914100000_development_plan_gaps_insert_approved_fix.sql`). This is currently **dormant, not exploitable**, because nothing in the schema can move an assessment's status away from `approved` once reached — but it is a fragile invariant that would silently start leaking data the moment any "unapprove"/reopen transition is ever added.

**Risk #1** (general RLS boundary integrity) is otherwise solid: all 7 tables have RLS actually enabled (not just policies defined, `ENABLE ROW LEVEL SECURITY` confirmed present for each); the leader→report relationship is a direct one-hop FK (`profiles.manager_id`) with no transitive path anywhere, so a leader's leader cannot see a report's report; `assessment_scores_update_leader_review` intentionally authorizes the whole row (no column-level RLS) and is documented in its own migration comment as relying on the API layer (`approve.ts`/`return.ts` sending only `{ leader_comment }`) — this is a deliberate, accepted design, not a silent gap, and both routes were confirmed to build update payloads from explicit named fields only, never spreading the request body.

**Risk #4's double-invocation cases are all safe**: approve-twice, return-on-already-approved, and submit-twice are each correctly rejected with 409 at the route layer, and would also be independently blocked by RLS if the route check were bypassed (traced through both layers for all three cases).

**Test infra is confirmed at zero** — no test runner installed, no config, no test files outside `node_modules`. Local Supabase (`supabase/config.toml`: API on `127.0.0.1:54321`, DB on `54322`) plus `SUPABASE_URL`/`SUPABASE_KEY` (both declared optional in `astro.config.mjs`'s env schema) is the natural target for RLS-as-different-users integration tests. `supabase/seed.sql` has usable positive fixtures (Bob: `submitted` under Junior Leader) but no "returned for correction" state and no cross-manager negative fixture — both will need to be added or synthesized in-test.

## Detailed Findings

### Risk #1 — RLS boundary integrity

All 7 RLS-relevant tables (`profiles`, `competency_models`, `competencies`, `assessments`, `assessment_scores`, `development_plans`, `development_plan_gaps`) have `ENABLE ROW LEVEL SECURITY` actually run — confirmed at `supabase/migrations/20260913120000_role_and_competency_model_foundation.sql:74-76`, `20260913150000_employee_self_assessment.sql:27-28`, `20260914090000_ai_development_plan.sql:28-29`.

- `profiles_select` (`20260913120000...sql:78-84`): `id = auth.uid() or manager_id = auth.uid() or public.is_admin()`. `manager_id` is a self-referencing FK directly on `profiles` (`:8`) — structurally one hop, no hierarchy/closure table. A leader's leader cannot see a report's report.
- `competency_models`/`competencies`: broad authenticated-read (`auth.uid() is not null`), admin-only write — intentional shared reference data, solid.
- `assessments_select_leader` (current: `20260913160200_leader_review_visibility_fix.sql:11-20`, superseding `20260913160100...sql:14-23`) and `assessment_scores_select_leader` (current: `20260913160300_leader_review_scores_visibility_fix.sql:10-20`) both use the same direct `p.manager_id = auth.uid()` join — no transitive leakage anywhere in the schema.
- `assessment_scores_update_leader_review` (`20260913160100...sql:65-83`) has no column-level WITH CHECK — the migration's own comment (`:61-64`) documents that RLS authorizes the whole row and the API layer (`approve.ts:71-73`, `return.ts`) is what restricts writes to `{ leader_comment }`. Confirmed both routes build the update payload from explicit named fields only, no spreading.

### Risk #4 — status-lock integrity (LIVE GAP FOUND)

```sql
-- supabase/migrations/20260913150000_employee_self_assessment.sql:43-46
create policy "assessments_update_own_draft_only" on public.assessments
  for update
  using (employee_id = auth.uid() and status = 'draft')
  with check (employee_id = auth.uid());
```

WITH CHECK does not constrain the resulting `status`. `src/pages/api/assessments/[id]/submit.ts:30,65-69` explicitly comments that "RLS is the real enforcement boundary" for this transition and does not itself limit which status value the update can set beyond what the app happens to send (`status: "submitted"`, `submit.ts:70-75` — explicit named fields, no spreading). Nothing stops a direct client call from setting `status: "approved"` (plus `reviewed_by`/`reviewed_at`) on the same row instead. No service-role/bypass client exists anywhere in `src/` (grepped, zero matches for `service_role`/`SERVICE_ROLE`) — RLS is genuinely the only gate on this table, and this specific policy's WITH CHECK doesn't mirror the invariant its own migration comment (`:38-42`) claims to enforce.

Once `status = 'approved'` via this path, the row is permanently unreachable by both `assessments_update_own_draft_only` (requires prior `status='draft'`) and `assessments_update_leader_review` (requires prior `status='submitted'`) — no admin-scoped UPDATE policy exists on `assessments` either. So this is a one-way, terminal self-escalation: not reversible, but reached by skipping the leader entirely.

**By contrast**, `assessment_scores_update_own_draft_only`'s WITH CHECK (`20260913150000...sql:69-85`) has no equivalent gap — that policy only ever writes to `assessment_scores` columns, not `assessments.status`, so there's no state to escalate through it.

**Double-invocation / out-of-order calls — all correctly blocked, at both layers:**

| Scenario | Route-layer outcome | RLS-layer outcome if route check bypassed |
|---|---|---|
| `approve.ts` called on an already-`approved` assessment | `status !== "submitted"` → 409 before any write (`approve.ts:63-65`) | `assessments_update_leader_review` USING requires prior `status='submitted'` → 0 rows affected |
| `return.ts` called on an already-`approved` assessment | Same guard → 409 (`return.ts:63-65`) | Same USING clause blocks it |
| `submit.ts` called on an already-`submitted` assessment | `status === "submitted"` → 409 (`submit.ts:34-38`) | `assessments_update_own_draft_only` USING requires prior `status='draft'` → 0 rows affected |

Minor cosmetic-only note: `submit.ts:34` checks specifically `status === "submitted"`, not `status !== "draft"` — if called on an already-`approved` assessment, this specific early guard doesn't fire and execution falls through to the score-count logic, but the final UPDATE is still correctly rejected by RLS (0 rows → `updated === null` → 409 at `submit.ts:79-83`). Functionally safe; the 409 error message ("already been submitted") is just misleading for the approved case.

### Risk #2 — approval guardrail on plan generation/viewing

`src/pages/api/plans/[assessmentId]/generate.ts:50-52` performs an explicit application-level check (not RLS-only):
```ts
if (assessment.status !== "approved") {
  return new Response(JSON.stringify({ error: "This assessment has not been approved yet" }), { status: 409 });
}
```
404 if the assessment doesn't exist (`:31-33`), 403 if the caller is neither the employee nor their manager (`:44-48`). This check is correctly implemented for what it checks — the problem (see Risk #4 above) is that the `status` value it trusts can itself be forged by the employee via the RLS gap.

Both viewing surfaces independently gate the entire plan-fetch block on `assessment.status === "approved"` before ever querying `development_plans` — `src/pages/assessment.astro:72-77` and `src/pages/reviews/[id].astro:63-68` — so a plan is never even queried for a non-approved assessment through the UI.

RLS on the plan tables:
- `development_plans_insert` / `development_plans_update` (`20260914090000...sql:49-59, 61-80`) — both correctly require `a.status = 'approved'`.
- `development_plans_select` (`:35-44`) and `development_plan_gaps_select` (`:82-92`) — **neither checks `a.status = 'approved'`**, only the employee/manager relationship. Currently dormant/non-exploitable because (a) INSERT already gates creation on `approved`, and (b) per Risk #4's analysis, nothing in the schema can move `assessments.status` away from `approved` once reached (aside from the newly-found employee-self-escalation path, which moves status *to* approved, not away from it). Would become live the instant any "unapprove"/reopen transition is ever added. `development_plan_gaps_insert`'s current version (`20260914100000_development_plan_gaps_insert_approved_fix.sql:7-18`) already had this exact class of omission caught and fixed once — its sibling SELECT policies were not covered by that fix.

**Concurrency**: calling `generate` twice on an approved assessment is race-safe — both requests attempt `upsert({assessment_id}, {onConflict:"assessment_id", ignoreDuplicates:true})` (`generate.ts:60-64`); the `unique(assessment_id)` constraint (`20260914090000...sql:14`) ensures exactly one insert "wins" and proceeds to generate, the other re-reads and returns the current state as HTTP 200 with no duplicate generation.

**Fire-and-forget trigger** lives client-side, not in `approve.ts` (which has no reference to `/api/plans/`): `src/components/reviews/ReviewForm.tsx:44-50` — `void fetch(...)` immediately followed by `window.location.reload()` on the next line, confirmed genuinely not awaited. `src/components/plan/DevelopmentPlanView.tsx:15-26` is the view-time fallback/retry.

### What the two "_fix" migrations reveal about this codebase's RLS track record

- `20260913160200_leader_review_visibility_fix.sql` fixed a *functional* break: the original `assessments_select_leader` used `status <> 'draft'`, so the instant a leader returned an assessment to `draft`, Postgres would reject the leader's own UPDATE (a resulting row invisible to every applicable SELECT policy is rejected outright) — not just a visibility nicety, the return-for-correction workflow itself was broken. Fixed by adding `or reviewed_by = auth.uid()`.
- `20260914100000_development_plan_gaps_insert_approved_fix.sql` fixed a *consistency* gap: `development_plan_gaps_insert` was missing the `a.status = 'approved'` clause its sibling `development_plans_insert` already had, caught in implementation review per the migration's own comment.
- The newly-found `assessments_update_own_draft_only` WITH CHECK gap (Risk #4) is a **third, previously uncaught instance of the same class of bug** — WITH CHECK not mirroring the invariant implied by USING/the migration's stated intent — and the highest-severity one found: it bypasses leader review entirely rather than just leaking or blocking a row.

### Test infrastructure baseline

- Zero test runner config, zero test-runner packages in `package.json`, zero `*.test.*`/`*.spec.*`/`__tests__` files outside `node_modules` (confirmed via Glob + Grep).
- `supabase/config.toml`: API `127.0.0.1:54321`, DB `127.0.0.1:54322`, Studio `54323`. No static keys committed — the Supabase CLI prints local anon/service-role keys on `supabase start`.
- `.env.example` names exactly `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`. `astro.config.mjs:37-42` declares all three `optional: true` — a test harness can set or omit them without failing Astro's env validation.
- `.github/workflows/ci.yml` currently: checkout → setup-node(22) → `npm ci` → `astro sync` → `npm run lint` → `npm run build` (with real `SUPABASE_URL`/`SUPABASE_KEY` repo secrets, not local Supabase). No test step exists yet; wiring one in will need either a `supabase/setup-cli` + `supabase start` step (for RLS integration tests against local Supabase) or none (for pure-unit tests like gap computation).
- `supabase/seed.sql` fixtures: Junior Leader manages Alice (`draft`, 2/6 scored) and Bob (`submitted`, 6/6 scored) — Bob is the only ready-made positive fixture for approve/return tests. Dana/Gina/Iris (competence_leaders) manage Frank/Grace/Henry, all pre-seeded `approved`. **No seeded "returned for correction" (draft-after-submit) state, and no cross-manager negative fixture** — e.g. proving Dana (not Bob's manager) cannot approve/return Bob's `submitted` assessment needs a fixture combining Bob (under Junior Leader) with Dana's session, which is possible with existing seed data (different managers already exist) but isn't a named/labeled scenario in the seed file today.

## Code References

- `supabase/migrations/20260913150000_employee_self_assessment.sql:43-46` — the live RLS gap: `assessments_update_own_draft_only` WITH CHECK doesn't constrain target `status`
- `supabase/migrations/20260913150000_employee_self_assessment.sql:69-85` — `assessment_scores_update_own_draft_only`, no equivalent gap (writes scores, not `assessments.status`)
- `supabase/migrations/20260913160100_leader_review_and_approval.sql:31-47` — `assessments_update_leader_review` (USING gates on prior `status='submitted'`)
- `supabase/migrations/20260913160100_leader_review_and_approval.sql:65-83` — `assessment_scores_update_leader_review`, whole-row authorization, column split enforced at API layer only (documented in the migration's own comment)
- `supabase/migrations/20260913160200_leader_review_visibility_fix.sql:11-20` — current `assessments_select_leader`, fixes a Postgres "resulting row invisible" break
- `supabase/migrations/20260913160300_leader_review_scores_visibility_fix.sql:10-20` — current `assessment_scores_select_leader`
- `supabase/migrations/20260914090000_ai_development_plan.sql:35-44` — `development_plans_select`, not gated on `status='approved'` (dormant gap)
- `supabase/migrations/20260914090000_ai_development_plan.sql:49-80` — `development_plans_insert`/`_update`, correctly gated
- `supabase/migrations/20260914090000_ai_development_plan.sql:82-92` — `development_plan_gaps_select`, not gated (dormant gap, sibling of the fixed INSERT policy)
- `supabase/migrations/20260914100000_development_plan_gaps_insert_approved_fix.sql:7-18` — the fix that added the `approved` check to `development_plan_gaps_insert` only, not its SELECT sibling
- `src/pages/api/assessments/[id]/submit.ts:30,34-38,65-83` — ownership/status checks, explicit-field update, comment naming RLS as the real boundary
- `src/pages/api/reviews/[id]/approve.ts:60-101` — ownership/status checks, explicit-field updates for both `assessment_scores` and `assessments`
- `src/pages/api/reviews/[id]/return.ts:60-98` — structurally identical to `approve.ts`, sets `status: "draft"` instead
- `src/pages/api/plans/[assessmentId]/generate.ts:23-33,44-52,60-119` — approval check, race-safe upsert-and-claim generation
- `src/pages/assessment.astro:72-88` — employee plan-view gate on `status === "approved"`
- `src/pages/reviews/[id].astro:63-79` — leader plan-view gate on `status === "approved"`
- `src/components/reviews/ReviewForm.tsx:44-50` — fire-and-forget generation trigger, confirmed not awaited
- `src/components/plan/DevelopmentPlanView.tsx:15-26` — view-time fallback/retry trigger
- `astro.config.mjs:37-42` — env schema, all three secrets optional
- `supabase/config.toml` — local API (54321) / DB (54322) / Studio (54323) ports
- `.github/workflows/ci.yml:1-24` — current pipeline, no test step
- `supabase/seed.sql` — profile hierarchy and assessment-status fixtures (see Test infrastructure baseline above)

## Architecture Insights

- **RLS is genuinely the enforcement boundary app-wide** — no service-role/bypass client exists anywhere in `src/`, and several route comments explicitly say so. This makes RLS correctness the single most load-bearing property in the codebase; the plan's Risk #1 framing ("RLS doesn't lock what it was believed to lock") is not hypothetical caution, it is the exact failure class this codebase has already hit twice (the two "_fix" migrations) and a third time undetected until this research pass.
- **The recurring bug shape is WITH CHECK not mirroring USING/the stated invariant.** All three known instances (two fixed, one newly found) are variations of "the migration comment describes an invariant that only USING enforces, and WITH CHECK is either missing the check entirely or checks a different, looser condition." This is a pattern worth naming explicitly for `/10x-plan` and for `context/foundation/lessons.md`.
- **Upstream trust chains matter**: the plan-generation gates (route + RLS INSERT policies) are individually correct, but they trust `assessments.status`, which — because of the Risk #4 gap — is not actually trustworthy today. A future reviewer checking only the plan-generation code in isolation would conclude Risk #2 is fully mitigated; it isn't, because the vulnerability is one layer upstream.

## Historical Context (from prior changes)

- `context/archive/2026-09-13-employee-self-assessment/plan.md` — "Critical Implementation Details: RLS enforces the post-submit lock, not just the route" — the original design intent this gap violates.
- `context/archive/2026-09-13-leader-review-and-approval/plan.md` — "Critical Implementation Details: Column-level tampering on `assessment_scores` is a route-level, not RLS-level, guarantee" — the self-identified fragility that grounded Risk #3 (not in this phase's scope; covered by rollout Phase 2) and, by the same pattern, motivated closely inspecting every other WITH CHECK clause in this phase.
- `context/archive/2026-09-14-ai-development-plan/plan.md` — documents the intended race-safety design (`unique(assessment_id)` constraint) confirmed still correctly implemented; also documents the "approved-only" generation guardrail intent, which this research confirms is correctly implemented at the generate-route and INSERT-policy layers, but not fully closed at the upstream `assessments` UPDATE-policy layer.

## Related Research

None — this is the first research artifact for this change and the first rollout phase of `context/foundation/test-plan.md`.

## Open Questions

- Should the `assessments_update_own_draft_only` WITH CHECK gap be fixed as part of this test-plan rollout phase (a migration change), or only covered by a regression test that currently fails/documents the gap, with the fix tracked as a separate change? This is a `/10x-plan`-time (or immediate) decision, not a research one — flagging here since it changes Phase 1's scope from "prove the lock holds" to "fix the lock, then prove it holds."
- Should the dormant `development_plans_select`/`development_plan_gaps_select` gap be fixed defensively now (cheap, symmetric with the already-fixed INSERT policy) even though it's not currently exploitable, or left as a documented fragility with a regression test asserting today's actual (non-gated) behavior? Recommend fixing defensively given how cheap the change is and the codebase's demonstrated history of exactly this bug class.
