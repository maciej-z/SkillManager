# Bootstrap + Critical-Path Auth Integrity Implementation Plan

## Overview

This is rollout Phase 1 of `context/foundation/test-plan.md`. It fixes a live RLS
security gap research found (an employee can currently self-approve their own
draft assessment, bypassing leader review entirely), fixes a related dormant
gap, and stands up this project's first-ever test infrastructure to prove
both fixes hold and stay held. It closes Risks #1 (RLS boundary integrity),
#2 (approval guardrail on plan generation/viewing), and #4 (status-lock
integrity) from `context/foundation/test-plan.md` §2.

## Current State Analysis

- Zero test infrastructure exists: no test runner, no config, no test files
  outside `node_modules` (`context/changes/testing-bootstrap-critical-path-auth-integrity/research.md`
  "Test infrastructure baseline").
- `assessments_update_own_draft_only`'s RLS `WITH CHECK` clause
  (`supabase/migrations/20260913150000_employee_self_assessment.sql:43-46`)
  only checks `employee_id = auth.uid()`, never the target `status`. RLS is
  the only enforcement boundary on this table (no service-role client exists
  anywhere in `src/`; `submit.ts` explicitly defers to RLS) — so an employee
  can currently issue a direct write setting their own draft's `status` to
  `'approved'` with fabricated `reviewed_by`/`reviewed_at`, skipping
  submission and leader review. Once set this way the row is genuinely
  terminal (no policy can revert it) — see research.md "Risk #4" for the
  full trace.
- `development_plans_select` / `development_plan_gaps_select`
  (`supabase/migrations/20260914090000_ai_development_plan.sql:35-44,82-92`)
  never check `assessments.status = 'approved'`, unlike their already-fixed
  INSERT siblings. Dormant today (nothing can revert `status` away from
  `'approved'`), but the same bug shape already bit this codebase twice
  (the two "_fix" migrations) — see research.md "Risk #2".
- All app-level route checks (submit/approve/return/generate) and the
  route-facing view gates are correctly implemented — research traced every
  one of them. The gap is entirely at the RLS layer, one level upstream of
  where the route logic looks correct.
- The codebase's established RLS-fix convention is one policy family per
  migration file, `drop policy` + `create policy`, with a comment explaining
  what broke and why (`supabase/migrations/20260913160200_leader_review_visibility_fix.sql`,
  `supabase/migrations/20260914100000_development_plan_gaps_insert_approved_fix.sql`).
- All seeded users share password `pilot-password` (`supabase/seed.sql:6`) —
  a test harness can sign in as any seeded user via
  `supabase.auth.signInWithPassword()` against local Supabase and get a real
  session, exercising real RLS rather than a mock.
- `supabase/seed.sql` has every fixture this phase needs except one: no
  "returned for correction" assessment state. The cross-manager negative
  case (a leader who is *not* the assessment owner's manager) is already
  covered by existing data — Leader Dana (`99999999…91`) is not Employee
  Bob's manager (Junior Leader is), so Dana attempting to act on Bob's
  `submitted` assessment (`aaaaaaaa…2`) is a ready-made negative fixture.
- `astro.config.mjs:37-42` declares `SUPABASE_URL`/`SUPABASE_KEY` as
  `optional: true` server secrets, resolved through the `astro:env/server`
  virtual module — which only resolves inside Astro's own Vite pipeline.
  API routes (`submit.ts`, `approve.ts`, `return.ts`, `generate.ts`) all
  call `createClient(context.request.headers, context.cookies)` from
  `src/lib/supabase.ts` themselves (not `context.locals.supabase`) — that
  file is what imports `astro:env/server`.
- `.github/workflows/ci.yml:1-24` has no test step today; it builds against
  a real remote Supabase project via repo secrets, not local Supabase.
- Node 22.14 (`.nvmrc`) has built-in `process.loadEnvFile()` (stable since
  Node 20.6) — no `dotenv` dependency needed to load `.dev.vars` for tests.

### Key Discoveries:

- The live gap chains directly into Risk #2: `development_plans_insert`/
  `development_plan_gaps_insert` correctly gate on `assessments.status =
  'approved'`, but they trust that value — they can't tell a leader-approved
  row from a self-approved one. Fixing Risk #4's gap is what actually closes
  the exploitable half of Risk #2; the dormant SELECT-policy gap is a
  separate, currently-unreachable instance of the same bug shape.
- Testing the fix for Risk #4 through app routes alone would **not** catch
  a regression — every route already correctly rejects out-of-order calls.
  Only a direct RLS-level write (bypassing the route layer entirely) proves
  the underlying policy holds. (research.md, backported into test-plan.md §2
  Risk #4 response guidance.)
- Testing the dormant SELECT-policy fix requires a `development_plans` row
  whose parent assessment is *not* `'approved'` — a state no RLS-scoped
  client can ever produce today (that's the whole reason the gap is
  dormant). This needs a narrow, clearly-scoped test-arrangement bypass —
  see Critical Implementation Details.

## Desired End State

- `assessments_update_own_draft_only`'s `WITH CHECK` restricts an
  employee's own-draft update to `status = 'submitted'` — a direct write
  setting `status = 'approved'` (or anything else) on a draft row is
  rejected by Postgres with an RLS-violation error.
- `development_plans_select` and `development_plan_gaps_select` both
  require the parent assessment's `status = 'approved'`, matching their
  INSERT siblings.
- `npm run test` runs a Vitest suite (currently zero tests) covering: a
  harness smoke test, both fixes' regression tests, RLS-as-different-users
  coverage across `assessments`/`assessment_scores`/`development_plans`/
  `development_plan_gaps`, and route-handler regression tests for every
  status-transition route plus `generate.ts`.
- `.github/workflows/ci.yml` runs the full suite against a freshly-started
  local Supabase instance on every push/PR, gating merges.
- `context/foundation/test-plan.md` §6 (6.2, 6.6) documents the integration
  test location, naming, and reference pattern this phase establishes.
- `npx supabase db reset` still applies cleanly with the two new migrations
  and the one new seed fixture.

## What We're NOT Doing

- Not testing `profiles`, `competency_models`, or `competencies` RLS —
  research confirmed all three solid, and no covered risk names them. Per
  the user's risk-driven-subset decision, they get no fresh coverage this
  phase.
- Not adding a full HTTP-level (`astro dev` + fetch) test harness — route
  handlers are exercised by importing them directly with a hand-built
  `APIContext`, which covers the risks in scope without needing a running
  server. A later rollout phase can add HTTP/e2e coverage if a risk ever
  needs it.
- Not unit-testing gap-computation arithmetic or the team-gap aggregation —
  those belong to rollout Phases 3 and 4 respectively; this phase is
  RLS/route-integrity focused end to end, with no unit-testable logic of
  its own.
- Not adding a service-role Supabase key anywhere in the test harness or
  app config. The one place that needs to bypass RLS for test arrangement
  (see Critical Implementation Details) uses a direct Postgres connection
  to the local dev database instead, scoped to that one helper.
- Not changing `submit.ts`'s cosmetic status-message mismatch (research
  flagged calling `submit` on an already-`approved` assessment returns
  "already been submitted" instead of a more accurate message) — it's
  functionally safe (RLS still rejects the write) and out of scope for an
  auth-integrity phase.

## Implementation Approach

Bootstrap the harness first (Phase 1) since every later phase depends on
it. Add the one missing seed fixture next (Phase 2) so later phases have
real data to test against. Fix and regression-test the live gap (Phase 3),
then the dormant gap (Phase 4) — each fix ships with its own proof before
moving on, so a broken fix is caught immediately rather than at the end.
Broaden to full risk-driven RLS + route-handler coverage (Phase 5) once
both fixes are proven. Wire CI and update the cookbook last (Phase 6),
once there's a real suite to gate on and a real pattern to document.

## Critical Implementation Details

### Route-handler tests use a mocked client, not simulated SSR cookies

`@supabase/ssr`'s cookie-based session format is internal and non-trivial
to hand-construct. Since route handlers call `createClient(headers,
cookies)` from `@/lib/supabase` themselves, tests `vi.mock("@/lib/supabase")`
to swap `createClient` for a function that returns an already-authenticated
`@supabase/supabase-js` client (obtained via the same password sign-in used
everywhere else), ignoring the real headers/cookies arguments entirely.
`context.locals.user`/`context.locals.profile` are set directly from the
signed-in session on the hand-built `APIContext`, matching what
`src/middleware.ts` would have populated. This still exercises real RLS
(the mocked client carries a real JWT) — it only skips Astro's own
cookie-parsing plumbing, which is middleware's concern, not the route
handlers' or RLS's.

### Testing the dormant SELECT-policy fix needs a narrow, explicit bypass

No RLS-scoped client can ever produce a `development_plans` row whose
parent assessment isn't `'approved'` — that's exactly why the gap is
dormant. To prove the fix holds if that ever becomes reachable, one test
helper (`tests/integration/helpers/pg-admin.ts`) connects directly to the
local Postgres instance (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`
— the Supabase CLI's well-known local-only default, confirmed at
`supabase/config.toml` `[db] port = 54322`) using the `pg` package, bypassing
RLS entirely. It is used **only** to arrange this one otherwise-unreachable
fixture state (create a plan while approved via the normal client, then
force the parent assessment's `status` directly via `pg-admin`) — never to
perform or bypass the actual assertion, which still goes through a normal
RLS-scoped client. Comment this distinction clearly at the call site.

### Vitest needs no Astro-specific config

Because the one file that imports `astro:env/server`
(`src/lib/supabase.ts`) is always mocked in route-handler tests, and RLS
tests never import it at all (they talk to `@supabase/supabase-js`
directly), plain Vitest with a `resolve.alias` for `@/*` → `./src/*`
(mirroring `tsconfig.json`) is sufficient — no `getViteConfig` from
`astro/config` needed.

### Env loading for tests

A `tests/setup/load-env.ts` global setup file calls
`process.loadEnvFile(".dev.vars")` wrapped in try/catch (the file won't
exist in CI, where the test step sets `SUPABASE_URL`/`SUPABASE_KEY`
directly as job env from `supabase start`'s output instead). Tests that
need Supabase reachable should fail loudly with a clear error if the env
vars are unset or the connection fails — this suite is meant to become a
required gate, not one that silently skips.

## Phase 1: Bootstrap test infra

### Overview

Stand up Vitest, the password-based test-user sign-in helper, the
`APIContext` route-handler test helper, and one smoke test proving the
whole chain works before anything else is built on it.

### Changes Required:

#### 1. Test runner dependency and scripts

**File**: `package.json`

**Intent**: Add Vitest as the project's test runner.

**Contract**: Add `vitest` to `devDependencies`. Add scripts `"test": "vitest run"` and `"test:watch": "vitest"`.

#### 2. Vitest configuration

**File**: `vitest.config.ts` (new, repo root)

**Intent**: Point Vitest at the `tests/` tree, resolve the `@/*` alias, and load env for local runs.

**Contract**: `test.environment: "node"`, `test.include: ["tests/**/*.test.ts"]`, `test.setupFiles: ["./tests/setup/load-env.ts"]`, `resolve.alias` mapping `@` → `./src` (mirrors `tsconfig.json:9-11`).

#### 3. Env loader

**File**: `tests/setup/load-env.ts` (new)

**Intent**: Load `SUPABASE_URL`/`SUPABASE_KEY` from `.dev.vars` for local test runs, without requiring a new dependency.

**Contract**: `try { process.loadEnvFile(".dev.vars"); } catch { /* absent in CI — env already set by the job */ }`.

#### 4. Seeded test-user table

**File**: `tests/integration/helpers/test-users.ts` (new)

**Intent**: One place naming every seeded user this test suite uses, instead of magic strings/UUIDs scattered across test files.

**Contract**: Export a `TEST_USERS` object keyed by role-name (e.g. `employeeAlice`, `employeeBob`, `juniorLeader`, `leaderDana`, …) with `{ email, id }` per `supabase/seed.sql`'s current fixtures, plus the new `returnedEmployee` fixture Phase 2 adds. Export `PILOT_PASSWORD = "pilot-password"` as the shared constant from `supabase/seed.sql:6`.

#### 5. Test-client helper

**File**: `tests/integration/helpers/supabase-test-client.ts` (new)

**Intent**: Sign in as a given seeded user and return an authenticated client for RLS-direct tests.

**Contract**: `signInAs(email: string): Promise<SupabaseClient>` — creates a plain `@supabase/supabase-js` client from `process.env.SUPABASE_URL`/`SUPABASE_KEY`, calls `signInWithPassword({ email, password: PILOT_PASSWORD })`, throws with a clear message (pointing at `npx supabase start`) if it fails, returns the signed-in client.

#### 6. APIContext test helper

**File**: `tests/integration/helpers/api-context.ts` (new)

**Intent**: Build a minimal `APIContext`-shaped object for calling route handlers directly, and mock `@/lib/supabase` to inject a signed-in client.

**Contract**: `buildContext({ user, profile, client, params, body })` returns an object with `locals: { user, profile }`, `params`, a `request` (constructed via `new Request(url, { method, body: body ? JSON.stringify(body) : undefined })`), and a no-op `cookies` stub (routes never read cookies directly — only `createClient` does, and that's mocked). A documented pattern for `vi.mock("@/lib/supabase", () => ({ createClient: () => client }))` per test file, since the mock factory needs the per-test signed-in client.

#### 7. Harness smoke test

**File**: `tests/integration/smoke.test.ts` (new)

**Intent**: Prove the whole chain (local Supabase reachable, sign-in works, RLS is live) before any risk-specific test depends on it.

**Contract**: Sign in as `employeeBob`, read his own `assessments` row, assert it's returned. Sign in as `employeeAlice`, attempt to read Bob's `assessments` row by id, assert the result is empty (RLS scoping proven, not just "the harness runs").

### Success Criteria:

#### Automated Verification:

- [ ] `npx supabase start && npx supabase db reset` succeeds
- [ ] `npm run test` runs and `tests/integration/smoke.test.ts` passes
- [ ] `npm run lint` passes on the new test files

#### Manual Verification:

- [ ] Run the above locally end-to-end once and confirm the smoke test's second assertion (Alice can't read Bob's row) actually fails if you temporarily comment out `assessments_select_own`'s scoping — proves the test would catch a real regression, not just a happy path

---

## Phase 2: Seed fixture — returned-for-correction state

### Overview

Add the one fixture `supabase/seed.sql` is missing: an assessment that was
submitted, then returned for correction by a leader.

### Changes Required:

#### 1. Returned-assessment fixture

**File**: `supabase/seed.sql`

**Intent**: Give later phases a real "returned" row to test resubmission and to confirm returned history (leader comments) survives a return-then-view cycle.

**Contract**: Add a new employee (`Employee Chris`, reporting to Junior Leader, alongside Alice and Bob) with an assessment matching exactly what `return.ts`'s update payload produces (`src/pages/api/reviews/[id]/return.ts:94-101`): `status = 'draft'`, `submitted_at` set (preserved from the original submission, not cleared), `reviewed_by` = Junior Leader's id, `reviewed_at` set, `leader_comment` set to a short note. All 6 competencies scored (it was complete enough to submit), with at least one `assessment_scores.leader_comment` populated to prove per-competency leader feedback survives the return.

### Success Criteria:

#### Automated Verification:

- [ ] `npx supabase db reset` applies cleanly with the new fixture

#### Manual Verification:

- [ ] Supabase Studio: Chris's assessment shows `status = 'draft'`, `submitted_at` non-null, `reviewed_by`/`reviewed_at` set, and at least one score has a `leader_comment`

---

## Phase 3: Fix + test the live gap (Risk #4)

### Overview

Close the self-approval RLS gap and prove it's closed with a direct-write
test that would have caught it before this phase.

### Changes Required:

#### 1. Migration: constrain the draft-update lock to the intended target status

**File**: `supabase/migrations/20260914110000_assessment_status_lock_fix.sql` (new)

**Intent**: Fix `assessments_update_own_draft_only`'s `WITH CHECK` to actually enforce the one-way `draft → submitted` transition the migration's original comment claims.

**Contract**: `drop policy "assessments_update_own_draft_only" on public.assessments;` then recreate it with `with check (employee_id = auth.uid() and status = 'submitted')` (USING clause unchanged). Comment references this research finding and the two prior "_fix" migrations as the same bug shape. Follow the exact drop+create convention of `supabase/migrations/20260913160200_leader_review_visibility_fix.sql`.

#### 2. Regression test: self-approval is rejected; legitimate submit still works

**File**: `tests/integration/rls-assessments.test.ts` (new)

**Intent**: Prove the fix — this is the test that fails on the old policy and passes on the new one.

**Contract**: Sign in as `employeeAlice` (draft, per seed). Attempt a direct `update({ status: "approved", reviewed_by: alice.id, reviewed_at: now }).eq("id", alice's assessment)` via her own client — assert the call returns an RLS-violation error, not a silent no-op. Then attempt the legitimate `update({ status: "submitted" })` — assert it succeeds. Both assertions in the same test file so a future reader sees the fix's exact boundary.

### Success Criteria:

#### Automated Verification:

- [ ] `npx supabase db reset` applies both new migrations cleanly (Phase 3 + eventually Phase 4)
- [ ] `npm run test` passes, including the new self-approval-rejected assertion
- [ ] Phase 1's smoke test still passes (no regression from the policy change)

#### Manual Verification:

- [ ] Supabase Studio → Authentication/Database → Policies: confirm `assessments_update_own_draft_only`'s WITH CHECK now shows the `status = 'submitted'` clause

---

## Phase 4: Fix + test the dormant gap (Risk #2)

### Overview

Close the dormant `development_plans_select`/`development_plan_gaps_select`
gap defensively, for symmetry with the already-fixed INSERT policies, and
prove it with the narrow pg-admin arrangement bypass described in Critical
Implementation Details.

### Changes Required:

#### 1. Migration: gate plan/gap SELECT on approval, matching the INSERT siblings

**File**: `supabase/migrations/20260914110100_development_plan_select_approved_fix.sql` (new)

**Intent**: Make `development_plans_select` and `development_plan_gaps_select` mirror the `status = 'approved'` gate their INSERT siblings already enforce.

**Contract**: Drop and recreate both policies, each adding `and a.status = 'approved'` to the existing `exists(...)` clause (same join shape as today, per `supabase/migrations/20260914090000_ai_development_plan.sql:35-44,82-92`). Comment references the dormant-gap finding and the sibling INSERT fix (`20260914100000_development_plan_gaps_insert_approved_fix.sql`) as the pattern being completed.

#### 2. Test-arrangement helper: direct Postgres bypass, test-only

**File**: `tests/integration/helpers/pg-admin.ts` (new)

**Intent**: Arrange the one fixture state no RLS-scoped client can produce (a `development_plans` row whose parent assessment isn't `'approved'`), scoped narrowly to test setup — see Critical Implementation Details.

**Contract**: `forceAssessmentStatus(assessmentId: string, status: string): Promise<void>` using the `pg` package against `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. A code comment at the top of the file states plainly: this bypasses RLS, is used only to arrange fixture state, and must never be used in an assertion path.

#### 3. Regression test: plan/gap SELECT rejects a non-approved parent

**File**: `tests/integration/rls-development-plans.test.ts` (new)

**Intent**: Prove the fix — approved-then-forced-back-to-submitted is the only way to exercise the new clause.

**Contract**: As `employeeBob` (or another employee with an approved assessment + generated plan from existing fixtures — Frank/Grace under Dana), confirm the plan is visible via the normal client. Use `pg-admin`'s `forceAssessmentStatus` to set the parent assessment back to `'submitted'`. Re-query as the same employee via the normal client — assert the plan (and its gaps) are no longer returned. Restore or use a disposable transaction/rollback so this doesn't corrupt other tests' fixtures (see Testing Strategy).

### Success Criteria:

#### Automated Verification:

- [ ] `npx supabase db reset` applies cleanly (both Phase 3 and Phase 4 migrations)
- [ ] `npm run test` passes, including the plan-select-rejects-non-approved assertion
- [ ] Prior phases' tests still pass

#### Manual Verification:

- [ ] Supabase Studio → Policies: confirm both `development_plans_select` and `development_plan_gaps_select` now show the `status = 'approved'` clause

---

## Phase 5: RLS + route-handler coverage (Risks #1, #2, #4)

### Overview

Broaden from the two specific fixes to the full risk-driven subset: general
ownership/manager boundary tests on the four named tables, plus
route-handler regression tests for every status-transition endpoint and
`generate.ts`, all using the Phase 1 harness.

### Changes Required:

#### 1. RLS boundary tests — assessments & assessment_scores

**File**: `tests/integration/rls-assessments.test.ts` (extends Phase 3's file)

**Intent**: Cover Risk #1 for the two tables most directly tied to the approval workflow, using the cross-manager negative fixture that already exists in seed data.

**Contract**: As `leaderDana` (not Bob's manager), attempt to read Bob's `submitted` assessment via `assessments_select_leader` — assert empty result. As `leaderDana`, attempt the leader-review-shaped update (`status: "approved", reviewed_by: dana.id`) on Bob's assessment — assert rejected. As `employeeBob`, attempt to update his own `assessment_scores` after submission — assert rejected (characterizes the already-correct `assessment_scores_update_own_draft_only` re-check). As `juniorLeader` (Bob's actual manager), attempt a direct `assessment_scores` update setting `score` (not just `leader_comment`) on Bob's submitted assessment — assert it **succeeds at the RLS layer**, with a comment explaining this characterizes the documented, accepted gap (column-level restriction is enforced by the route layer, not RLS — `assessment_scores_update_leader_review`'s migration comment) rather than a bug to fix.

#### 2. RLS boundary tests — development_plans & development_plan_gaps

**File**: `tests/integration/rls-development-plans.test.ts` (extends Phase 4's file)

**Intent**: Cover Risk #1's ownership/manager scoping on the plan tables, beyond the status-gate fix already tested.

**Contract**: Using existing Frank/Grace (report to Dana) and Henry (reports to Gina) fixtures: as `leaderGina`, attempt to read Frank's development plan — assert empty (Gina isn't Frank's manager). As `employeeAlice` (unrelated employee), attempt to read Frank's plan — assert empty.

#### 3. Route-handler regression tests

**File**: `tests/integration/routes-assessment-lifecycle.test.ts` (new)

**Intent**: Cover the already-safe double-invocation/out-of-order cases research traced, locking them in as regression tests, plus the generate-route guardrail and race safety.

**Contract**: Using the Phase 1 `buildContext`/mock pattern, call each route handler directly:
- `submit.ts` called twice on the same (now-submitted) assessment → second call returns 409.
- `approve.ts` called on an already-`approved` assessment → 409.
- `return.ts` called on an already-`approved` assessment → 409.
- `approve.ts`/`return.ts` called by `leaderDana` (non-manager) on Bob's `submitted` assessment → 403.
- `generate.ts` called on a `submitted` (not approved) assessment → 409.
- `generate.ts` called twice concurrently (via `Promise.all`) on an approved assessment (Frank's) → both resolve without error, and a subsequent count query confirms exactly one `development_plans` row exists for that assessment. Run with `OPENROUTER_API_KEY` unset (per the codebase's existing null-tolerant stub convention) so generation is deterministic and makes no real network call.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run test` passes with all new assertions across the three test files
- [ ] `npm run lint` passes
- [ ] Full suite runtime stays reasonable for local iteration (no test performs unbounded polling/sleeps)

#### Manual Verification:

- [ ] Spot-check one RLS test and one route-handler test by temporarily reverting their corresponding fix/logic and confirming the test fails — proves the suite has real teeth, not just green checkmarks

---

## Phase 6: CI wiring + cookbook

### Overview

Wire the suite into CI as a required gate, and update `test-plan.md` §6
with the patterns this phase established.

### Changes Required:

#### 1. CI test step

**File**: `.github/workflows/ci.yml`

**Intent**: Make the new suite a required gate on every push/PR, matching test-plan.md §5.

**Contract**: After the existing `lint` step and before (or alongside) `build`, add steps to install the Supabase CLI (`supabase/setup-cli` action), run `supabase start`, apply `npx supabase db reset` (migrations + seed), export `SUPABASE_URL`/`SUPABASE_KEY` from `supabase status -o env` into the job environment (values differ from the `secrets.SUPABASE_URL`/`SUPABASE_KEY` used by the existing `build` step, which target the real project), run `npm run test`, then stop the local instance.

#### 2. Cookbook update

**File**: `context/foundation/test-plan.md`

**Intent**: Document the integration-test pattern this phase established, per the rollout orchestrator's contract.

**Contract**: Fill in §6.2 ("Adding an integration test") — Location: `tests/integration/`; Naming: `<area>.test.ts` for RLS-focused files (`rls-<table>.test.ts`), `routes-<flow>.test.ts` for route-handler files; Mocking policy: only mock `@/lib/supabase` in route-handler tests (never mock Supabase itself in RLS tests — they must hit the real local instance); Reference test: `tests/integration/rls-assessments.test.ts`; Run locally: `npx supabase start && npx supabase db reset && npm run test`. Add a §6.6 note (2-3 lines) naming the WITH CHECK-doesn't-mirror-USING bug pattern found three times in this codebase, so future RLS policy authors watch for it specifically.

### Success Criteria:

#### Automated Verification:

- [ ] CI workflow YAML is valid (`.github/workflows/ci.yml` parses)
- [ ] A CI run (push or PR) completes the new test step successfully

#### Manual Verification:

- [ ] Open the Actions run and confirm the test step's output shows the full suite passing, not skipped
- [ ] Read back `test-plan.md` §6.2 and §6.6 and confirm they read as genuinely useful instructions for someone adding the next test, not a restatement of this plan

---

## Testing Strategy

### Unit Tests:

- None in this phase — every risk covered (#1, #2, #4) is RLS/route-integrity in nature. Unit-testable logic (gap computation, team-gap aggregation) belongs to rollout Phases 3 and 4.

### Integration Tests:

- RLS-as-different-users tests against local Supabase (Phases 1, 3, 4, 5) — the primary layer for Risks #1, #2, #4.
- Route-handler tests via direct import + hand-built `APIContext` (Phase 5) — confirms app-level behavior matches the now-fixed RLS layer.
- Phase 4's `pg-admin` helper is the one deliberate, narrowly-scoped exception to "always test through a real RLS-scoped client" — used only to arrange an otherwise-unreachable fixture state, never to assert.
- Tests that mutate shared seed rows (e.g., Phase 4's forced status change) must restore state afterward (or run in a rolled-back transaction) so test order and repeated `npm run test` runs stay independent — call this out explicitly in the Phase 4 test file.

### Manual Testing Steps:

1. `npx supabase start`
2. `npx supabase db reset`
3. `npm run test` — confirm the full suite passes
4. Follow each phase's Manual Verification steps above (regression-proof by temporarily reverting a fix/logic and confirming the corresponding test fails)

## Performance Considerations

Local Supabase startup adds real time to CI (a few minutes for `supabase
start` + `db reset`) — acceptable for a solo, one-week PoC per the test
plan's own scope note; not optimized further in this phase.

## Migration Notes

Two new additive migrations (`20260914110000`, `20260914110100`), both
policy-only (no schema/data changes), applied after the existing nine.
`npx supabase db reset` re-applies everything from scratch — no backfill
needed for existing local data.

## References

- Research: `context/changes/testing-bootstrap-critical-path-auth-integrity/research.md`
- Test plan: `context/foundation/test-plan.md` (§2 Risks #1/#2/#4, §3 Phase 1, §4 Stack, §5 Quality Gates)
- Prior fix convention: `supabase/migrations/20260913160200_leader_review_visibility_fix.sql`, `supabase/migrations/20260914100000_development_plan_gaps_insert_approved_fix.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Bootstrap test infra

#### Automated

- [x] 1.1 `npx supabase start && npx supabase db reset` succeeds
- [x] 1.2 `npm run test` runs and `tests/integration/smoke.test.ts` passes
- [x] 1.3 `npm run lint` passes on the new test files

#### Manual

- [ ] 1.4 Confirm the smoke test's scoping assertion actually fails if `assessments_select_own` is temporarily broken

### Phase 2: Seed fixture — returned-for-correction state

#### Automated

- [ ] 2.1 `npx supabase db reset` applies cleanly with the new fixture

#### Manual

- [ ] 2.2 Supabase Studio: Chris's assessment shows the expected returned-state shape

### Phase 3: Fix + test the live gap (Risk #4)

#### Automated

- [ ] 3.1 `npx supabase db reset` applies the new migration cleanly
- [ ] 3.2 `npm run test` passes, including the self-approval-rejected assertion
- [ ] 3.3 Phase 1's smoke test still passes

#### Manual

- [ ] 3.4 Supabase Studio: confirm the updated WITH CHECK clause

### Phase 4: Fix + test the dormant gap (Risk #2)

#### Automated

- [ ] 4.1 `npx supabase db reset` applies both new migrations cleanly
- [ ] 4.2 `npm run test` passes, including the plan-select-rejects-non-approved assertion
- [ ] 4.3 Prior phases' tests still pass

#### Manual

- [ ] 4.4 Supabase Studio: confirm both updated SELECT policies

### Phase 5: RLS + route-handler coverage (Risks #1, #2, #4)

#### Automated

- [ ] 5.1 `npm run test` passes with all new assertions
- [ ] 5.2 `npm run lint` passes
- [ ] 5.3 Full suite runtime stays reasonable

#### Manual

- [ ] 5.4 Spot-check: revert a fix/logic and confirm the corresponding test fails

### Phase 6: CI wiring + cookbook

#### Automated

- [ ] 6.1 `.github/workflows/ci.yml` is valid
- [ ] 6.2 A CI run completes the new test step successfully

#### Manual

- [ ] 6.3 Actions run shows the full suite passing, not skipped
- [ ] 6.4 test-plan.md §6.2/§6.6 read as genuinely useful
