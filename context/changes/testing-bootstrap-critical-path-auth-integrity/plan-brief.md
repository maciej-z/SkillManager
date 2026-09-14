# Bootstrap + Critical-Path Auth Integrity — Plan Brief

> Full plan: `context/changes/testing-bootstrap-critical-path-auth-integrity/plan.md`
> Research: `context/changes/testing-bootstrap-critical-path-auth-integrity/research.md`

## What & Why

This is rollout Phase 1 of the project's test-plan. Research grounding this
phase found a live security gap — an employee can currently self-approve
their own draft assessment via a direct write, bypassing leader review
entirely, because an RLS `WITH CHECK` clause doesn't constrain the target
status. This plan fixes that gap (and a related dormant one), then stands
up this project's first-ever test infrastructure to prove both fixes hold.

## Starting Point

Zero test infrastructure exists today — no runner, no config, no test
files. All app-level route checks are correctly implemented; the gap is
purely at the RLS layer, one level upstream of where the route logic looks
correct. This is the third instance of the same "WITH CHECK doesn't mirror
the invariant USING implies" bug shape in this codebase — two earlier
instances were already caught and fixed by two prior "_fix" migrations.

## Desired End State

An employee cannot self-approve a draft assessment via any direct write. A
development plan can never become visible for a non-approved assessment,
even defensively. `npm run test` runs a real Vitest suite hitting local
Supabase as different seeded users, gated in CI on every push/PR.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Fix scope | Fix the migration in this phase, then test it | The gap is live and exploitable; shipping a test that only documents broken behavior leaves the app vulnerable | Plan (user) |
| Route-handler testing | Import handler + hand-built `APIContext` | Fast, no server process, still exercises real RLS through a real signed-in client | Plan (user) |
| Test-user auth | Sign in via password per test | Matches the app's real auth path exactly, no new secret-handling surface | Plan (user) |
| Missing fixtures | Add to shared `supabase/seed.sql` | One source of truth, reusable by later rollout phases | Plan (user) |
| RLS test breadth | Risk-driven subset (4 tables, not all 7) | Matches cost×signal — the other 3 tables were already confirmed solid | Plan (user) |
| CI wiring | Wire it into `ci.yml` in this phase | Matches test-plan §5's stated intent — no gap between "tests exist" and "tests are enforced" | Plan (user) |
| Regression tests for safe cases | Include them | Cheap given the harness already exists; locks in current-correct behavior | Plan (user) |
| Test file location | `tests/integration/` at repo root | Separates DB-hitting tests from the source tree; no existing convention to conflict with | Plan (user) |
| Dormant-gap fix | Fix + test for symmetry | Closes the exact bug shape that's already bitten this codebase 3 times | Plan (user) |
| Dormant-gap test arrangement | Direct Postgres bypass (`pg-admin.ts`), not a service-role key | Arranges an otherwise-unreachable fixture state without adding a new credential surface to the app | Plan |

## Scope

**In scope:**
- Two new RLS-fix migrations (live self-approval gap, dormant plan-visibility gap)
- Vitest bootstrap: config, password-based sign-in helper, `APIContext` helper
- One new seed fixture (returned-for-correction state)
- RLS-direct and route-handler tests covering Risks #1, #2, #4
- CI wiring + `test-plan.md` §6 cookbook update

**Out of scope:**
- `profiles`/`competency_models`/`competencies` RLS (already confirmed solid, no covered risk names them)
- Full HTTP/e2e test harness
- Unit tests (gap computation, team-gap aggregation — later rollout phases)
- Any service-role key in the app or general test harness

## Architecture / Approach

RLS tests sign in as real seeded users and hit local Supabase directly via
`@supabase/supabase-js`. Route-handler tests import the route's exported
function and call it with a hand-built `APIContext`, mocking only
`@/lib/supabase`'s `createClient` to inject the same signed-in client —
still exercising real RLS, just skipping Astro's cookie-parsing plumbing.
One narrowly-scoped exception: proving the dormant SELECT-gate fix requires
a fixture state no RLS-scoped client can produce, so a dedicated
`pg-admin.ts` helper connects directly to local Postgres (bypassing RLS)
for test *arrangement* only, never for the assertion itself.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Bootstrap test infra | Vitest, sign-in helper, `APIContext` helper, smoke test | Harness itself doesn't actually prove RLS scoping (mitigated by an explicit revert-and-confirm-failure check) |
| 2. Seed fixture | Returned-for-correction assessment state | Fixture drifts from what `return.ts` actually writes |
| 3. Fix + test live gap | Migration + regression test for self-approval | — |
| 4. Fix + test dormant gap | Migration + regression test using `pg-admin` bypass | Bypass helper accidentally used in an assertion path instead of arrangement only |
| 5. RLS + route-handler coverage | Full risk-driven test matrix | Test suite runtime grows; shared-fixture mutation causing test-order coupling |
| 6. CI wiring + cookbook | `ci.yml` test step, `test-plan.md` §6 update | Local Supabase startup time in CI |

**Prerequisites:** local Supabase (`npx supabase start`), Node 22.14
**Estimated effort:** ~1-2 sessions across 6 phases

## Open Risks & Assumptions

- Assumes `supabase status -o env` (or equivalent CLI output) reliably exposes the local anon key for CI — verify against the installed Supabase CLI version during Phase 6.
- Assumes Phase 4's transaction-scoped/restore-after-use pattern is sufficient to keep the `pg-admin` fixture mutation from leaking into other tests — worth double-checking test isolation once Phase 5 adds more tests around the same fixtures.

## Success Criteria (Summary)

- An employee cannot self-approve a draft assessment by any direct write — proven by a test that fails on the old policy and passes on the new one.
- A development plan is never visible for a non-approved assessment, even via the narrow arrangement bypass.
- `npm run test` passes locally and in CI, gating every push/PR.
