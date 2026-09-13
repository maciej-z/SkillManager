<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Employee Self-Assessment

- **Plan**: context/changes/employee-self-assessment/plan.md
- **Scope**: Phase 1-3 of 3 (full plan review — all phases marked complete)
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — `competency_id` isn't validated against the assessment's own competency model

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/assessments/[id]/scores.ts:9-19, 54-57
- **Detail**: The scores schema validates `competency_id` as UUID-shaped but never checks it actually belongs to `assessment.competency_model_id`. No DB constraint or trigger enforces this cross-table relationship either (`assessment_scores.competency_id` only has a plain FK to `competencies(id)`, nothing tying it to the parent assessment's model). An employee could score a competency from a different (e.g. deactivated) competency model, polluting `assessment_scores` with rows that don't correspond to what the assessment is actually measuring. Not a cross-employee privilege issue — RLS still confines this to the employee's own assessment — but it's a real data-integrity gap that would corrupt input to S-03's future gap-ranking logic if it were ever exploited (deliberately or by a client bug).
- **Fix A ⭐ Recommended**: In `scores.ts`, after fetching the assessment, verify every submitted `competency_id` exists in `competencies` filtered by `assessment.competency_model_id` before upserting; reject with 400 listing any that don't belong.
  - Strength: Matches this codebase's existing defense-in-depth pattern (e.g. `submit.ts`'s server-side completeness check) — an extra query, no schema change.
  - Tradeoff: One more round trip per save-scores call; negligible at pilot scale.
  - Confidence: HIGH — same shape as the completeness check already proven in `submit.ts`.
  - Blind spot: None significant.
- **Fix B**: Add a DB-level trigger on `assessment_scores` that joins to `assessments`/`competencies` and rejects a mismatched `competency_model_id` at the database layer.
  - Strength: Enforced no matter what calls the table — true defense-in-depth, survives future code paths that might bypass the route.
  - Tradeoff: A cross-table check can't be a plain `CHECK` constraint; needs a `BEFORE INSERT/UPDATE` trigger function, more migration machinery for a gap only exploitable by the assessment's own owner today.
  - Confidence: MEDIUM — correct, but more than the current risk level obviously demands.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — `scores.ts` now fetches valid competency ids scoped to `assessment.competency_model_id` and rejects any requested id not in that set with a 400 listing the offenders. Verified live: seeded a throwaway competency on a different (inactive) model and confirmed it's rejected (`400`, exact offending id named), while a legitimate same-model score still saves (`204`). `npm run lint` and `npx astro check` both pass.

### F2 — Submit proceeds even if the preceding draft save silently failed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/assessment/AssessmentForm.tsx:70-82
- **Detail**: `handleSubmit` calls `await handleSaveDraft()` but that function returns `void` and only records failure into its own local `error` state — it never signals failure back to the caller. If the draft save fails (network blip, transient 5xx), `handleSubmit` proceeds to call the submit route anyway using whichever scores were last successfully persisted, not the user's latest edits, and the "Failed to save draft" message is immediately overwritten by the submit call's own state before the user can register it.
- **Fix**: Have `handleSaveDraft` return a boolean (or throw), and have `handleSubmit` check it and abort with the draft error surfaced if the save failed, instead of calling `/submit` regardless.
- **Decision**: FIXED — `handleSaveDraft` now returns `Promise<boolean>` (false + sets `error` on a failed save), and `handleSubmit` checks the result and returns early (resetting `submitting`) without ever calling the submit route if the draft save failed. `npm run lint` and `npx astro check` both pass.

## Observations

### F3 — Double-submitting "Start assessment" surfaces a raw Postgres error

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/assessments/index.ts:31-38
- **Detail**: A double-click (or two tabs) on "Start assessment" hits the `(employee_id, competency_model_id)` unique constraint and surfaces the raw unique-violation message as a 400. No duplicate row is created — data integrity is fine — this is purely a rough UX edge at pilot scale.
- **Fix**: Optional — catch the unique-violation and return a clearer 409/message, or accept as-is for pilot scope.
- **Decision**: FIXED — `assessments/index.ts` now catches Postgres unique-violation (`error.code === "23505"`) and returns 409 "You already have an assessment for this competency model" instead of the raw error. Verified live: Bob (already has a seeded assessment) attempting to create another now gets exactly this 409. `npm run lint` and `npx astro check` both pass.

## Non-findings confirmed clean

- **Resubmit false-positive risk (the exact class of bug fixed in F1's middleware type issue during F-01)**: `submit.ts` defends against RLS silently zero-rowing a concurrent/duplicate submit with both an early `status === "submitted"` check (409) and a `.select().maybeSingle()` check on the update's returned row (409 if null) — verified correct by both the drift-detection sub-agent and a live SQL test against the seeded DB.
- **A sub-agent raised the same false-positive concern about `scores.ts`'s upsert path (no explicit status check before the upsert).** I verified this directly against the running database: impersonating Bob (submitted, 6/6 scored) and attempting to upsert a new value onto an already-scored competency via the exact `on conflict (assessment_id, competency_id) do update` shape `scores.ts` generates raises a genuine `new row violates row-level security policy` **error** — not a silent no-op — and the score is confirmed unchanged afterward. Postgres enforces `ON CONFLICT DO UPDATE` through the INSERT's `WITH CHECK` semantics (hard error), not a plain `UPDATE`'s `USING` semantics (silent filter) — the two code paths are not equivalent, and `scores.ts` was never actually at risk here. This was also incidentally exercised during Phase 2's own manual verification (Bob's save-scores attempt returned exactly this 400/RLS-error response).
- **Radio-group SSR crash risk (the live lessons.md concern)**: a sub-agent flagged this as unverified (blocked from running `astro dev` itself). I ran this exact check earlier in this session against a live dev server, signed in as Alice: all 6 `data-slot="radio-group"` blocks rendered correctly in the SSR'd HTML under `client:load`, with no errors in the dev server log. Confirmed non-issue — no `client:only` fallback needed.
- **`uuidLike` duplication in `src/pages/api/admin/**`**: flagged by a sub-agent as a "natural follow-up cleanup left undone" — this is not a gap, it's an explicit decision recorded in the plan's own "What We're NOT Doing" section (deliberately not retrofitting existing admin routes to avoid unrelated churn).
- All Phase 1 schema/RLS contract items (enum, tables, unique constraints, the load-bearing `USING (status = 'draft')` clause on the existing row) match the plan exactly.
- Both new API-route ownership checks (fetch-then-compare `employee_id`) are present on every mutating route, backstopped by RLS, matching F-01's established "fast-fail UX layer" convention.
- No SQL injection surface — Supabase query builder only, no raw SQL/string interpolation.
- Every new file handles a null Supabase client / unauthenticated user gracefully.
- `npm run lint`, `npx astro check` (0 errors), and `npx supabase db reset` all re-verified passing at review time.

## References

- Sub-agent reviews: plan-drift detection and safety/quality/pattern compliance, run in parallel over all 3 phases' changed files.
- Verification commands re-run at review time: `npm run lint` (pass), `npx astro check` (0 errors), `npx supabase db reset` (pass).
- Live DB verification: simulated the exact `scores.ts` upsert as the seeded "Bob" account against his own submitted assessment — confirmed a hard RLS error, not a silent no-op, and confirmed the underlying score was unchanged.
