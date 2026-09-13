<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Leader Review and Approval

- **Plan**: context/changes/leader-review-and-approval/plan.md
- **Scope**: Phase 1-3 of 3 (full plan review — all phases marked complete)
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Employees never see their approved assessment or the leader's feedback

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/assessment.astro:92-115
- **Detail**: This plan adds `'approved'` to the shared `AssessmentStatus` enum, but never touches `assessment.astro` (an S-01 file) to add a branch for it. Confirmed directly: the page only switches on `status === "draft"` (line 92) and `status === "submitted"` (line 98) — once a leader approves, the employee's own `/assessment` page renders nothing but the header. This isn't a stated contract this plan violated (the plan's "Changes Required" never lists `assessment.astro`), it's a plan *gap*: adding a new terminal status value without auditing every existing switch-site that branches on the enum. It directly undermines the feature's whole point — S-02 exists so the employee gets visible leader feedback.
- **Fix**: Add an `assessment?.status === "approved"` branch to `assessment.astro`, mirroring the read-only block already built for the leader in `reviews/[id].astro:88-107` (show `reviewed_at`, the overall `leader_comment`, and each competency's `leader_comment` alongside the employee's own score).
- **Decision**: FIXED — added the `"approved"` branch to `assessment.astro`. Verified live: approved Bob's assessment as the leader, then confirmed Bob's own `/assessment` page shows the approval date, the leader's overall comment, and the per-competency leader comment. `npm run lint` and `npx astro check` both pass.

### F2 — Leader loses visibility into assessment_scores after returning an assessment

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260913160100_leader_review_and_approval.sql:49-59 (unchanged by the follow-up migration)
- **Detail**: The follow-up migration (`20260913160200`) fixed `assessments_select_leader` to add `or reviewed_by = auth.uid()` so a leader keeps visibility of an assessment after returning it — but `assessment_scores_select_leader` still gates purely on the parent's `status <> 'draft'`, with no equivalent exception. Verified live: after transitioning an assessment to `draft` with `reviewed_by` set to the leader, a direct `SELECT` against `assessment_scores` for that assessment returns **0 rows** for that leader — they can no longer see the per-competency comments they just wrote. The visibility fix was applied asymmetrically to one table but not its sibling with the identical gating shape.
- **Fix**: Add a small follow-up migration broadening `assessment_scores_select_leader`'s `EXISTS` subquery to also match when the parent assessment's `reviewed_by = auth.uid()`, mirroring the exact fix already applied to `assessments_select_leader`.
- **Decision**: FIXED — added `supabase/migrations/20260913160300_leader_review_scores_visibility_fix.sql`. Re-ran the exact failing scenario: leader's SELECT against `assessment_scores` after a return now returns all 6 rows (previously 0). Write access correctly remains closed after the return (matches the one-shot review-window design, unchanged). `npm run lint` and `npx astro check` both pass.

### F3 — Review detail page has no branch for a returned (draft) assessment

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/reviews/[id].astro:82-108
- **Detail**: Because of the visibility fix (F2's neighbor), a leader can now load `/reviews/<id>` directly for an assessment they've returned to draft — it's not "not found" anymore. But the page only renders a body for `status === "submitted"` (line 82) and `status === "approved"` (line 88); a `"draft"` status falls through both branches, leaving just the header and employee name with no content below — a silent dead end reachable by direct URL, back button, or browser history.
- **Fix**: Add a `status === "draft"` branch showing a "returned to employee, awaiting resubmission" message plus the leader's own overall comment (already visible via the `assessments` row regardless of F2).
- **Decision**: FIXED — added the `"draft"` branch to `reviews/[id].astro`. Verified live: returned Bob's assessment, then confirmed the leader's direct revisit to that assessment's detail page shows "Returned to the employee for correction — awaiting resubmission" plus the leader's own comment, instead of a blank body. `npm run lint` and `npx astro check` both pass.

### F4 — Per-competency comment loop can silently drop a comment

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/reviews/[id]/approve.ts:70-79, src/pages/api/reviews/[id]/return.ts:70-79
- **Detail**: The final `assessments` status update correctly uses `.select().maybeSingle()` to detect an RLS-silenced no-op and returns 409 (mirroring `submit.ts`'s proven defense). The per-competency `assessment_scores` update loop right above it does not: each iteration only checks `error`, never whether the update actually matched a row. A stale/mismatched `competency_id`, or a race where the parent's status flips mid-loop, would silently drop that one comment while the route still reports overall success.
- **Fix**: Add `.select("competency_id")` to each loop iteration's update and check the returned array has exactly one element; abort with 409 on the first miss rather than continuing.
- **Decision**: FIXED in both `approve.ts` and `return.ts` — each loop iteration now uses `.select("competency_id").maybeSingle()` and returns 409 naming the offending competency if no row matched. Verified live: an approve request with a bogus `competency_id` now returns 409 and the assessment stays `submitted` (no partial success); a legitimate approve still succeeds normally. `npm run lint` and `npx astro check` both pass.

## Observations

### F5 — RLS UPDATE policies don't restrict which columns change

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260913160100_leader_review_and_approval.sql:31-47, :65-83
- **Detail**: `WITH CHECK` on both leader-review UPDATE policies only re-verifies the manager relationship, not which columns change. A leader driving the Supabase REST API directly (bypassing `approve.ts`/`return.ts`) could write arbitrary values to other columns on their own reports' rows (e.g. `submitted_at`) during the submitted window — not a cross-tenant IDOR, just the same "RLS is row-level, not column-level" limitation the plan already documented for `assessment_scores`, unstated for `assessments` itself.
- **Fix**: No action needed for pilot scope — matches the plan's already-accepted risk model. Note for later if the threat model ever includes a malicious-insider leader.
- **Decision**: SKIPPED — accepted as-is, consistent with the plan's already-accepted risk model for this pilot scope.

### F6 — `/reviews` has no role-based redirect, unlike `/admin`

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/middleware.ts:5, 31-38
- **Detail**: `/admin` redirects non-admins; `/reviews` has no equivalent `role !== "competence_leader"` gate. Not a security gap (RLS already scopes the queue to real direct reports, so a non-leader just sees the empty state) — this matches the plan's own explicit "What We're NOT Doing" call ("data-scoped, not role-gated"), just noting the resulting inconsistency with `/admin`'s pattern.
- **Fix**: No fix needed — this was a deliberate plan decision, not an oversight.
- **Decision**: SKIPPED — deliberate plan decision, not an oversight.

### F7 — Review queue relies on RLS alone rather than mirroring the manager filter

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: src/pages/reviews.astro:18-22
- **Detail**: The plan's contract said the query should filter on `profiles.manager_id = user.id` explicitly, "mirroring [RLS] for clarity" — matching the defense-in-depth convention used elsewhere (e.g. admin pages). The actual query only filters `status = 'submitted'` and leans entirely on `assessments_select_leader` for the manager scoping. Functionally equivalent and not a security gap, just a literal deviation from the stated contract.
- **Fix**: Optional — add an explicit `.eq("profiles.manager_id", user.id)`-equivalent filter (via the embedded `employee` relation) purely for defense-in-depth/clarity; not required for correctness.
- **Decision**: FIXED — `reviews.astro` now embeds the employee relation with `!inner` and adds `.eq("employee.manager_id", user.id)` alongside the `status = "submitted"` filter, mirroring the plan's stated defense-in-depth contract. Verified live: Junior Leader's queue still correctly shows Bob, Senior Leader's queue still correctly shows the empty state. `npm run lint` and `npx astro check` both pass.

## Non-findings confirmed clean

- **Column-tampering guard** (the plan's single most safety-critical detail): both `approve.ts:73` and `return.ts:73` build the `assessment_scores` update as exactly `{ leader_comment: entry.leader_comment }` — never spreading the raw request body. Confirmed by both sub-agents independently.
- **False-positive-success defense on the terminal status transition**: both routes correctly reuse S-01's `.select().maybeSingle()` + null-check pattern from `submit.ts` for the final `assessments` update (409 on a silent RLS no-op).
- **`ReviewForm.tsx` does NOT repeat the `AssessmentForm.handleSaveDraft`/`handleSubmit` bug class** found and fixed during S-01's review — `handleDecision` makes one PATCH call; there's no separate pre-step whose failure could be silently ignored.
- **Error-surfacing convention**: `reviews.astro` and `reviews/[id].astro` both chain `loadError = loadError ?? xError.message` on every query, matching the fixed `assessment.astro` convention.
- **Migration split (enum-in-its-own-transaction)**: correctly isolates `ALTER TYPE ... ADD VALUE` ahead of any policy referencing `'approved'`.
- **The unplanned third migration itself** (`20260913160200_leader_review_visibility_fix.sql`) is sound engineering: a clean `drop`+`create` touching only the one affected policy, documented with an inline comment explaining the real Postgres mechanism, discovered and verified live during implementation (not speculative).
- All Phase 1/2 file contracts otherwise match the plan exactly, including every zod schema, ownership check, and route-gating pattern.
- `npm run lint`, `npx astro check` (0 errors), and `npx supabase db reset` all re-verified passing at review time.

## References

- Sub-agent reviews: plan-drift detection and safety/quality/pattern compliance, run in parallel over all 3 phases' changed files.
- Verification commands re-run at review time: `npm run lint` (pass), `npx astro check` (0 errors), `npx supabase db reset` (pass).
- Live DB verification: reproduced F2 directly (leader loses `assessment_scores` SELECT visibility after a return-for-correction transition) and confirmed F1 directly (`assessment.astro` has no `"approved"` branch).
