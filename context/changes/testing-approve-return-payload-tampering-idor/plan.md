# Approve/Return Payload Tampering Regression Tests — Implementation Plan

## Overview

Add an automated regression test proving that `approve.ts`/`return.ts` cannot be
tricked into writing an attacker-supplied `score` or `comment` value via the
review payload — the payload-tampering half of test-plan Risk #3. The IDOR
half of Risk #3 (cross-manager access rejected) is already covered by an
existing Phase 1 test and needs no new coverage (confirmed during planning).

## Current State Analysis

`src/pages/api/reviews/[id]/approve.ts` and `.../return.ts` are structurally
identical (only the final `status` literal differs: `"approved"` vs.
`"draft"`). Both already build their `assessment_scores`/`assessments`
`.update()` calls from explicitly named fields only — never a spread of the
raw request body — and their zod `reviewSchema` is a plain `z.object(...)`
(not `.strict()`), so Zod v4 silently strips unrelated keys during
`safeParse` rather than rejecting the request. This means an extra `score` or
`comment` key inside a `competency_comments[]` entry is defended against
today, in two independent ways — but neither defense has ever been exercised
by an automated test. The archived `leader-review-and-approval` plan itself
named this as a fragile, code-discipline-only guarantee (`plan-brief.md:62`:
*"a future refactor that spreads the raw request body into the update call
would silently reopen this gap"*).

`tests/integration/routes-assessment-lifecycle.test.ts` already imports and
tests both `approve` and `return` handlers (status-transition rejections,
and — incidentally — the IDOR 404 case), giving this change a natural,
already-wired home with zero new mock/import boilerplate.

## Desired End State

Two new integration tests (one for `approve.ts`, one for `return.ts`) exist
in `tests/integration/routes-assessment-lifecycle.test.ts` that: submit a
payload containing a legitimate `leader_comment` alongside an illegitimate
extra `score`/`comment` key inside a `competency_comments[]` entry, and
assert the persisted `assessment_scores.score`/`.comment` are byte-for-byte
unchanged from before the call while `leader_comment` (the one column the
route is supposed to touch) reflects the new value. Verified by:
`npx supabase start && npx supabase db reset && npm run test`.

### Key Discoveries:

- `src/pages/api/reviews/[id]/approve.ts:70-77` / `return.ts:70-77` — the
  update payload for `assessment_scores` is built as
  `{ leader_comment: entry.leader_comment }` only; any other key on `entry`
  (e.g. a tampered `score`) is inert even before this line, because the zod
  entry schema (`approve.ts:11-16`) already stripped it during `safeParse`.
- `src/pages/api/assessments/[id]/submit.ts:34-38,58-63` — `submit.ts`
  accepts any non-`"submitted"` status (so a `draft` row works) and requires
  every competency to already have a score row. `TEST_ASSESSMENTS.chrisReturned`
  (`tests/integration/helpers/test-users.ts:27`) is seeded `draft` with all 6
  competencies already scored (`supabase/seed.sql:161-167`) — it can be
  legitimately resubmitted with no new fixture data.
- `supabase/seed.sql:52-54` — `TEST_ASSESSMENTS.bobSubmitted` is the **only**
  seeded assessment already in `submitted` status, and
  `routes-assessment-lifecycle.test.ts:103-115` depends on it staying
  `submitted` — it cannot be reused for a test that performs a real
  approve/return call.
- `supabase/migrations/20260913160100_leader_review_and_approval.sql:65-83` —
  `assessment_scores_update_leader_review`'s `USING` clause requires
  `a.status = 'submitted'` at the moment of the leader's write. This is why
  the test must resubmit `chrisReturned` (via `submit.ts`) immediately before
  each tampering call, not merely rely on its seeded `draft` state.
- `tests/integration/rls-assessments.test.ts:125-154` — the established
  before/after value-capture pattern (`scoreToRestore`) for asserting a
  column's value survived a mutating call; this plan's new tests mirror that
  shape (capture "before," act, assert "after" against "before," not against
  a hardcoded seed constant), so no reset of `leader_comment`/`score`/`comment`
  content is needed for repeated `npm run test` runs — only the `status`
  column needs resetting (see Critical Implementation Details).
- `context/foundation/test-plan.md` §6.4 currently reads `TBD — see §3 Phase
  2 for the first payload-tampering / IDOR reference test.` — this plan's
  cookbook-update step is what resolves that placeholder.

## What We're NOT Doing

- **No new IDOR test.** Cross-manager rejection (Risk #3's other half) is
  already proven by `routes-assessment-lifecycle.test.ts:69-95`
  (`leaderDana` vs. `bobSubmitted` → 404 on both routes). The RLS mechanism
  that produces this (`assessments_select_leader`'s unconditional
  `manager_id = auth.uid()` AND-condition) is identical for any other
  non-manager/assessment pair, so a second pair would add no new signal.
- **No top-level bogus-field test** (e.g. an unrelated top-level key on the
  request body) and **no attempt to override server-computed fields**
  (`reviewed_by`, `reviewed_at`, `status`) via the payload. Both are
  defended by the identical zod-strip mechanism already exercised by the
  chosen `score`/`comment` scenario — added scenarios here would re-prove the
  same mechanism, not add signal.
- **No new pg-admin helpers and no new seed fixtures.** `chrisReturned` plus
  the existing `forceAssessmentStatus` helper are sufficient.
- **No changes to `approve.ts`/`return.ts` production code.** Current
  behavior is already correct; this phase adds a regression guard, not a fix.
- **No e2e/browser test.** Consistent with `test-plan.md` §4/§5 — no risk in
  this rollout requires full-browser coverage.

## Implementation Approach

Extend the existing `routes-assessment-lifecycle.test.ts` file with one new
`describe` block containing two `it` cases (approve, return) plus an
`afterEach`. Each test: (1) resubmits `chrisReturned` as `employeeChris` via
the already-imported `submit` handler, (2) signs in as `juniorLeader` (Chris's
real manager) and captures the pre-tamper `score`/`comment` for one seeded
competency, (3) calls `approve`/`returnForCorrection` with a payload whose
`competency_comments[0]` carries a legitimate `leader_comment` plus illegal
`score`/`comment` keys, (4) re-reads the row and asserts `score`/`comment`
are unchanged while `leader_comment` and the assessment's own `status`/
`leader_comment` reflect the legitimate update. `afterEach` unconditionally
resets `chrisReturned` back to `draft` via `pg-admin.ts`'s
`forceAssessmentStatus`.

## Critical Implementation Details

**State sequencing — `afterEach` must run unconditionally, even on failure.**
If a test throws before restoring `chrisReturned` to `draft`, the fixture is
left in `submitted` (approve test) or already-`draft`-but-differently-shaped
(return test) state for the next run. Left in `approved` specifically, the
*next* run's `submit.ts` call for a re-attempt does **not** hit its
`status === "submitted"` 409 check (since `"approved" !== "submitted"`) —
it falls through to the RLS-gated `UPDATE`, which silently matches zero rows
(the employee-draft-only policy requires `status = 'draft'`), and `submit.ts`
returns a misleading 409 "already submitted" for what is actually a stale
`approved` row. Use Vitest's `afterEach` (not a try/finally at the end of the
test body) so this reset runs even when an assertion fails, matching the
convention already established in `tests/integration/rls-assessments.test.ts:14-21`.

## Phase 1: Payload-tampering regression tests + cookbook update

### Overview

Add the two new tests and fill in the test-plan cookbook entry this phase
was scoped to resolve.

### Changes Required:

#### 1. New tampering tests

**File**: `tests/integration/routes-assessment-lifecycle.test.ts`

**Intent**: Prove, via a real call through each route handler, that an
attacker-controlled `score`/`comment` inside a `competency_comments[]` entry
never reaches the persisted row, while the legitimate `leader_comment` field
does — closing the untested half of Risk #3.

**Contract**:
- Add `forceAssessmentStatus` to the existing `./helpers/pg-admin` import
  (alongside `deleteDevelopmentPlansForAssessment`).
- New `describe("approve.ts / return.ts — payload tampering (Risk #3)", ...)`
  block with an `afterEach` that always calls
  `forceAssessmentStatus(TEST_ASSESSMENTS.chrisReturned, "draft")`.
- Two `it` cases, one per route, sharing this shape:
  1. `signInAs(TEST_USERS.employeeChris.email)` → set `clientHolder.current`
     → `buildContext({ client, params: { id: chrisReturned } })` →
     `submit(context)` → assert `204`.
  2. `signInAs(TEST_USERS.juniorLeader.email)` → set `clientHolder.current`
     → read `assessment_scores` (`score`, `comment`) for `chrisReturned` +
     one fixed seeded `competency_id` (e.g.
     `77777777-7777-7777-7777-777777777771`) as the "before" snapshot.
  3. `buildContext({ client, params: { id: chrisReturned }, body: {...} })`
     where `body.competency_comments[0]` = `{ competency_id, leader_comment:
     "<new value>", score: <tampered number>, comment: "<tampered string>" }`
     and top-level `leader_comment: "<new assessment-level value>"` →
     `approve(context)` / `returnForCorrection(context)` → assert `204`.
  4. Re-read the same `assessment_scores` row → assert `score`/`comment`
     equal the "before" snapshot (unchanged) and `leader_comment` equals the
     new value sent in step 3.
  5. Read the `assessments` row → assert `status` is `"approved"` (approve
     test) or `"draft"` (return test) and `leader_comment` equals the new
     top-level value sent in step 3.

#### 2. Cookbook update

**File**: `context/foundation/test-plan.md`

**Intent**: Resolve the `TBD` placeholder this phase was scoped to fill, per
this project's convention that each rollout phase's plan updates the
relevant §6 cookbook entry before closing.

**Contract**: Replace §6.4's `TBD — see §3 Phase 2...` line with the
location (`tests/integration/routes-assessment-lifecycle.test.ts`), naming
convention used, the reference test (this phase's `describe` block), and the
run command (`npx supabase start && npx supabase db reset && npm run test`).
Add one bullet to §6.6 under a new **Phase 2** heading noting the
zod-non-strict-plus-explicit-field double defense and that Risk #3's IDOR
half was found already covered rather than re-tested (so a future reader
doesn't wonder why no new IDOR test exists in this phase's test file).

### Success Criteria:

#### Automated Verification:

- Full suite passes: `npx supabase start && npx supabase db reset && npm run test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Red-green sanity check: temporarily change `approve.ts`'s
  `assessment_scores` update to spread `entry` instead of
  `{ leader_comment: entry.leader_comment }`, rerun the new test, confirm it
  fails, then revert the change. This is the regression this test exists to
  catch — confirming it actually catches it is part of accepting this phase.
- Confirm `context/foundation/test-plan.md` §6.4 and §6.6 read correctly and
  no longer contain a `TBD` for this phase.

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human that
the manual testing was successful before considering this change complete.

---

## Testing Strategy

### Unit Tests:

- None — no new production code in this phase.

### Integration Tests:

- Two new tests in `routes-assessment-lifecycle.test.ts`: approve-path and
  return-path tampering, as specified in Phase 1.

### Manual Testing Steps:

1. Run the full suite once as-is to confirm both new tests pass against
   current (already-correct) route code.
2. Perform the red-green sanity check described in Phase 1's Manual
   Verification, then revert.

## Performance Considerations

None — this phase adds two integration tests against local Supabase; no
production code or query pattern changes.

## Migration Notes

None — no schema or data changes. `chrisReturned` is reused via existing
route calls (`submit.ts`) and restored via the existing `forceAssessmentStatus`
helper; no seed data is modified.

## References

- Research: `context/changes/testing-approve-return-payload-tampering-idor/research.md`
- Pattern to imitate: `tests/integration/rls-assessments.test.ts:125-154` (before/after value-capture, guaranteed `afterEach` cleanup)
- Existing IDOR coverage (no new test needed): `tests/integration/routes-assessment-lifecycle.test.ts:69-95`
- Cookbook convention precedent: `context/foundation/test-plan.md` §6.2, §6.6 (Phase 1 entry)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Payload-tampering regression tests + cookbook update

#### Automated

- [ ] 1.1 Full suite passes: `npx supabase start && npx supabase db reset && npm run test`
- [ ] 1.2 Type checking passes: `npm run typecheck`
- [ ] 1.3 Linting passes: `npm run lint`

#### Manual

- [ ] 1.4 Red-green sanity check performed and reverted
- [ ] 1.5 `test-plan.md` §6.4/§6.6 confirmed updated, no `TBD` remaining for this phase
