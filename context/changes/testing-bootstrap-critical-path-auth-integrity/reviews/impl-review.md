<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Bootstrap + Critical-Path Auth Integrity

- **Plan**: context/changes/testing-bootstrap-critical-path-auth-integrity/plan.md
- **Scope**: Full plan (Phases 1-6)
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION (all findings LOW impact — no CRITICAL, no blocking issue)
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated verification (re-run at review time)

- `npx supabase db reset` — clean, all 11 migrations + seed applied
- `npm run test` — 4 files, 17/17 passed
- `npm run lint` — clean
- Real CI run (34871829038) — confirmed green, test step ran the real 17-test suite (verified via log inspection during Phase 6)

## Findings

### F1 — `api-context.ts`'s `buildContext` signature drifted from the Phase 1 Contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `tests/integration/helpers/api-context.ts` vs. plan.md Phase 1 item 6 Contract
- **Detail**: The Contract specified `buildContext({ user, profile, client, params, body })`. The actual implementation is `buildContext({ client, params, method, url, body })` — it derives `user`/`profile` itself via `client.auth.getUser()` + a `profiles` query rather than accepting them as inputs, and adds `method`/`url`. This is arguably more correct (guarantees `locals` can't drift out of sync with the signed-in client) and every test file relies on this derived form consistently — but the plan document doesn't reflect what was actually built.
- **Fix**: Update plan.md's Phase 1 item 6 Contract text to match the actual signature.
- **Decision**: FIXED

### F2 — Accepted-gap characterization test lacks guaranteed cleanup

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `tests/integration/rls-assessments.test.ts:107-144` ("characterizes the documented, accepted gap" test)
- **Detail**: The restore-to-original-score call sits inline after the assertions, not in an `afterEach`. If either assertion throws, cleanup is skipped and Bob's seeded score stays mutated for later tests/manual exploration. Every other stateful test in this change (this file's other `describe` block, `rls-development-plans.test.ts`, `routes-assessment-lifecycle.test.ts`) uses `afterEach` for guaranteed cleanup — this is the one exception. Not a correctness bug today (the test reads its "before" value dynamically rather than assuming a fixed score), but inconsistent with the rest of the suite's cleanup discipline.
- **Fix**: Move the restore into an `afterEach` (capture `originalScore` in outer scope, or re-read it there), matching the convention used everywhere else.
- **Decision**: FIXED

### F3 — Plan's premise for the development-plan test (pre-seeded plan fixture) was never true

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: plan.md Phase 4/5 Contract for `rls-development-plans.test.ts` vs. `supabase/seed.sql` (no `development_plans` rows are seeded anywhere)
- **Detail**: The Contract text references "another employee with an approved assessment + generated plan from existing fixtures — Frank/Grace." No `development_plans`/`development_plan_gaps` rows exist in seed data. The actual tests correctly compensate by inserting the plan directly inside the test via the normal authenticated client — this still proves exactly what the risk requires, but the plan's stated premise was inaccurate and was never corrected.
- **Fix**: Update the plan's Contract wording to describe what was actually done (test creates its own plan fixture inline) rather than referencing a nonexistent seeded fixture.
- **Decision**: FIXED

### F4 — Several helper extensions beyond their Phase Contracts, undocumented in the plan

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `tests/integration/helpers/test-users.ts` (`TEST_ASSESSMENTS`), `tests/integration/helpers/pg-admin.ts` (`deleteDevelopmentPlansForAssessment`), `vitest.config.ts` (`fileParallelism: false`)
- **Detail**: Each was added beyond what its originating phase's Contract literally specified. All three are small, clearly justified (in code comments and/or commit messages), and used consistently — genuinely necessary extensions discovered during implementation, not scope creep. The plan document itself doesn't mention them.
- **Fix**: Optional — no code change needed; add a one-line addendum to the relevant phase Contracts if you want the plan to fully reflect the final shape.
- **Decision**: SKIPPED

### F5 — Phase 6 Progress SHA attribution points at the checkbox-only commit, not the commit that shipped the work

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: plan.md Progress section, items 6.1-6.4
- **Detail**: All four are stamped `b8fb591`, which only edits plan.md's own checkboxes. The actual CI workflow and test-plan.md §6 changes landed one commit earlier, in `9acdd4c`. Every other phase's SHA points at the commit that shipped the work; Phase 6 doesn't. Plausibly intentional for 6.2/6.3 (which needed the push + real CI run to happen first), but 6.1 ("CI YAML is valid") was already true as of `9acdd4c`.
- **Fix**: Update item 6.1's SHA to `9acdd4c` for accuracy; 6.2-6.4 can reasonably stay at `b8fb591` since they specifically required the confirmed CI run.
- **Decision**: FIXED
