<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI Development Plan Implementation Plan

- **Plan**: context/changes/ai-development-plan/plan.md
- **Scope**: Phase 3 of 3 (full plan review)
- **Date**: 2026-09-14
- **Verdict**: REJECTED (pre-triage) — all 3 findings fixed during triage; see Decisions below
- **Findings**: 1 critical, 2 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Retry / pending-fallback is a permanent dead end once a plan row exists

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/plans/[assessmentId]/generate.ts:60-79
- **Detail**: The race-safety "claim" step is `upsert({assessment_id}, {onConflict: "assessment_id", ignoreDuplicates: true}).select()`. This correctly prevents two concurrent requests from both generating, but it also means: once ANY `development_plans` row exists for an assessment — `pending` (a request died mid-flight, e.g. Workers CPU/time limit) or `failed` (a real generation error) — every subsequent call to this route hits the unique-constraint conflict, `claimed.length === 0`, and the route just re-selects and returns the SAME stale row (lines 69-78) without ever attempting generation again. This is not implementation drift — the code does exactly what the plan's Contract literally says ("if the row already existed, re-fetch and return its current status immediately"). It's a design flaw in the plan's own race-safety mechanism that surfaced during implementation: the plan also promises (Desired End State, Critical Implementation Details) that a `failed` plan gets a working Retry, and that the view-time fallback "picks it up" if the eager trigger is lost — neither actually happens once a row is present. `DevelopmentPlanView.tsx`'s "Retry" button (failed) and "Check for development plan" button (pending) both POST to this same route and are therefore dead ends in exactly the cases they exist to handle.
  This also explains why manual check 3.6 "passed" without catching it: clicking Retry after a forced failure re-reads the same cached `failed` row and shows the same error — visually indistinguishable from a genuine second attempt that failed again with the same error.
- **Fix**: When the claim insert conflicts, don't unconditionally return the existing row — first attempt an atomic reclaim for a `failed` row: `UPDATE development_plans SET status = 'pending', error_message = null WHERE id = <existing.id> AND status = 'failed' RETURNING *` (via `.update(...).eq("id", existing.id).eq("status", "failed").select().maybeSingle()`). This is race-safe the same way the rest of the route is: the `WHERE status = 'failed'` guard means only one concurrent reclaim attempt succeeds (the loser's UPDATE affects zero rows and it just re-reads). If the reclaim succeeds, fall through into the existing generation logic using the reclaimed row. If the existing row's status is `ready`, keep current behavior (return as-is — a ready plan must stay immutable per "What We're NOT Doing"). A genuinely stuck `pending` row (the request that claimed it died without ever writing failed) is a rarer edge case with no clean fix in a queue-less environment — out of scope for this fix, but worth a one-line comment acknowledging it.
  - Strength: Directly fixes the reproducible, always-on bug (retry-from-failed) using the same conditional-UPDATE race-safety idiom already proven elsewhere in this route, without touching the insert-based claim for the "no row yet" case.
  - Tradeoff: The core claim logic in the route's most safety-critical section needs to change — worth a fresh manual re-test of 2.5 (no double-generation) and 3.6 (Retry actually regenerates) after the fix, since this touches exactly the mechanism those criteria are meant to protect.
  - Confidence: HIGH — verified directly by re-reading the current file; the conflict branch unconditionally returns the existing row with no status check at all.
  - Blind spot: Doesn't solve a truly stuck `pending` row (dead request, never reached `failed`). Acceptable for now given the plan's explicit "no automatic background retries" non-goal, but worth a lessons-worthy note if this surfaces again.
- **Decision**: FIXED — added a race-safe conditional-UPDATE reclaim (`WHERE status = 'failed'`) that falls through into generation on success, in `src/pages/api/plans/[assessmentId]/generate.ts`.

### F2 — Error from the failure-path's own status update is silently discarded

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/plans/[assessmentId]/generate.ts:181-190
- **Detail**: In the `catch` block, `const { data: failed } = await supabase.from("development_plans").update({status: "failed", ...})...` discards the update's own `error`. If that write itself fails (e.g. transient DB error), the route still returns HTTP 200 with a possibly-null body. The client's `res.ok` check passes and it silently reloads, compounding F1 by making a doubly-stuck plan (still `pending` in the DB, but the client thinks the request succeeded) undetectable.
- **Fix**: Check this update's `error` too; on failure return a non-200 response (e.g. 500 with `{error: error.message}`) instead of returning a possibly-empty 200 body.
- **Decision**: FIXED — added the `failedUpdateError` check, returns 500 with `{error: ...}` if the failed-status write itself fails.

### F3 — `development_plan_gaps_insert` RLS policy omits the `status = 'approved'` gate its siblings have

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: supabase/migrations/20260914090000_ai_development_plan.sql:94-104
- **Detail**: `development_plans_insert` and `development_plans_update` both additionally require the parent assessment's `status = 'approved'`, but the sibling `development_plan_gaps_insert` policy only checks the employee-or-manager relationship, not approval status. Low practical risk today (assessment status is treated as immutable once approved elsewhere in the app, and the only code path that inserts gaps already passed the approved-gated `development_plans` claim first), but it's an inconsistency with the stated invariant of the sibling policies and would become a real gap if that assumption ever changes.
- **Fix**: Add the same `and a.status = 'approved'` condition to `development_plan_gaps_insert`'s `with check`, for consistency with its sibling policies.
- **Decision**: FIXED — via a new follow-up migration `supabase/migrations/20260914100000_development_plan_gaps_insert_approved_fix.sql` (drops and recreates the policy with the added gate), following the same post-hoc-RLS-fix precedent as S-02's `leader_review_visibility_fix` migrations rather than editing the original migration in place.
