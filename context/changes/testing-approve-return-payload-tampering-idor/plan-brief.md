# Approve/Return Payload Tampering Regression Tests — Plan Brief

> Full plan: `context/changes/testing-approve-return-payload-tampering-idor/plan.md`
> Research: `context/changes/testing-approve-return-payload-tampering-idor/research.md`

## What & Why

Prove that an approve/return request carrying extra fields (e.g. a `score`)
cannot alter anything beyond its intended column — the payload-tampering half
of test-plan Risk #3. This is a named, self-flagged risk from the original
`leader-review-and-approval` implementation: the archived plan states the
column-tampering guard is enforced entirely by the route's payload-construction
code, not by RLS, and that "a future refactor that spreads the raw request
body into the update call would silently reopen this gap" — a claim that has
never had an automated test behind it.

## Starting Point

`approve.ts`/`return.ts` already build their DB writes from explicitly named
fields only (never a body spread), and their zod schema silently strips
unknown keys rather than rejecting them — so the tampering defense already
works today, in code, but with zero regression coverage. Risk #3's other
half — cross-manager IDOR — is already covered by an existing Phase 1 test
(`routes-assessment-lifecycle.test.ts:69-95`).

## Desired End State

Two new integration tests exist proving a tampered `score`/`comment` inside
the review payload never reaches the database, for both `approve.ts` and
`return.ts`, using only existing test infrastructure. The test-plan cookbook
(§6.4) documents the pattern for future endpoint tests.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Tamper scope | `score`/`comment` inside `competency_comments[]` only | Directly proves the named risk; top-level/server-computed-field variants would re-prove the same zod-strip mechanism with no new signal | Plan (user-confirmed) |
| Fixture | Reuse `chrisReturned`: resubmit via `submit.ts`, tamper, restore via `pg-admin`'s `forceAssessmentStatus` | Zero new seed data or helper code; `bobSubmitted` (the only other `submitted` fixture) is already relied on by another test | Plan (user-confirmed) |
| Route coverage | Both `approve.ts` and `return.ts` | The two files are separately maintained, near-identical copies — a regression in one wouldn't be caught by testing only the other | Plan (user-confirmed) |
| File location | Extend `routes-assessment-lifecycle.test.ts` | Already imports both handlers and has the mock/import boilerplate set up | Plan (user-confirmed) |
| IDOR coverage | None added — documented as already covered | `routes-assessment-lifecycle.test.ts:69-95` already proves this via an RLS mechanism that's identical for any non-manager pair | Plan (user-confirmed) |

## Scope

**In scope:**
- Two new integration tests (approve, return) in the existing test file
- `context/foundation/test-plan.md` §6.4/§6.6 cookbook update

**Out of scope:**
- New IDOR test (already covered)
- Top-level bogus-field or server-computed-field-override test scenarios
- New pg-admin helpers or seed fixtures
- Any production code change to `approve.ts`/`return.ts`
- e2e/browser testing

## Architecture / Approach

Both new tests follow the same shape: resubmit a `draft` fixture
(`chrisReturned`) to `submitted` via the already-covered `submit.ts` path,
sign in as the real manager, capture a "before" snapshot of one
`assessment_scores` row, call the route under test with a payload containing
a legitimate field plus an illegitimate one, then assert the illegitimate
field had no effect while the legitimate one applied. Cleanup restores only
the `status` column (via `forceAssessmentStatus`) — the before/after
comparison pattern means no other column needs restoring for repeat-run
idempotency.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Payload-tampering tests + cookbook update | Two regression tests + resolved `test-plan.md` §6.4 placeholder | If `afterEach` doesn't run on failure, `chrisReturned` is left in a state that breaks the *next* test run's `submit.ts` call with a misleading 409 |

**Prerequisites:** Phase 1 test infrastructure (`signInAs`, `buildContext`, `forceAssessmentStatus`, `TEST_USERS`/`TEST_ASSESSMENTS`) — already in place.
**Estimated effort:** Single session, one phase.

## Open Risks & Assumptions

- Assumes `chrisReturned`'s seeded data (all 6 competencies scored, managed by `juniorLeader`) remains as seeded — confirmed directly against `supabase/seed.sql` during research, not assumed from prior documentation.
- The manual red-green sanity check (temporarily reintroducing the spread-body bug to confirm the test catches it) is the strongest confirmation this test is load-bearing; skipping it would leave open whether the test actually exercises the risk it claims to.

## Success Criteria (Summary)

- `npm run test` (against local Supabase) passes with the two new tests included, and fails if the payload-construction guard is reverted to spread the raw body (verified manually once, then reverted).
- `test-plan.md` §6.4 no longer reads `TBD` for this phase.
