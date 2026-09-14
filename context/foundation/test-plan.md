# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-14

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in area Y"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/migrations/`
(22 commits in the last 30 days — sufficient signal).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | An Employee or Competence Leader sees or writes assessment/gap/plan data outside their own scope — an RLS policy doesn't actually lock what it was believed to lock | High | Medium-High | interview Q2 (named past incident: "an RLS policy didn't actually lock what I thought") · PRD Guardrail #1 · PRD Non-Functional Requirement |
| 2 | A development plan is generated or becomes viewable for an assessment that was never actually approved — the "approval step is not bypassable" guardrail is bypassed | High | Low-Medium | PRD Guardrail #2 (explicit, load-bearing) |
| 3 | A leader's review approve/return request tampers with a field it shouldn't (e.g. writing a score instead of only a comment), or a user reaches another user's assessment/plan by supplying an ID they don't own | High | Medium | archived slice `leader-review-and-approval` (self-identifies this as a route-level-only guarantee, not an RLS-level one) |
| 4 | A one-way status transition (draft → submitted → approved, or return-for-correction) gets reversed or re-entered, letting an already-approved assessment be edited after its plan was already computed | Medium-High | Low-Medium | archived slices `employee-self-assessment`, `leader-review-and-approval`, `ai-development-plan` (the same one-way-lock invariant is named independently in all three) |
| 5 | The AI-generated development plan's gaps/ranking, or its recommended actions, don't actually match the approved assessment's real gaps — stub-mode and real-API paths diverge, or actions read as generic and unrelated to the specific gap | High | Medium | interview Q1 (top worry) · PRD Guardrail #3 |
| 6 | Approving an assessment fails to trigger plan generation (silent no-op), or the eager-trigger + view-time-fallback design races and produces conflicting/duplicate plan state | High | Medium | interview Q1 · archived slice `ai-development-plan` (dual-trigger design plus a unique-constraint race guard) |
| 7 | The team-gap aggregation view miscounts, misranks, or leaks a non-report's data into a Competence Leader's "most common gaps" list | Medium-High | High | interview Q3 (named least-confident area — "brand new, no precedent in the codebase") · roadmap M-2 north-star framing |

**Abuse / security lens applied:** Risks #1 and #3 cover authorization/IDOR
and untrusted-input/column-tampering — both grounded in real evidence
(the Phase 2 interview and the archived plan's own self-flagged
fragility), not invented. No evidence in the PRD, roadmap, or interview
supports a resource-abuse (rate-limit) or secret/PII-leakage row for this
small, pre-provisioned pilot — none added.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|------------------------------|-----------------|----------------------------------------|--------------------------|--------------------------|
| #1 | A request as a non-owner/non-manager is rejected (empty read, rejected write) for every RLS-protected table; a request as the legitimate owner/manager succeeds | "The app never sends a request that violates RLS, so it's fine" — RLS is the real boundary, so it must be tested directly, not only through the app's routes | Current RLS policy text per table; the `manager_id` direct-vs-transitive distinction | integration/contract test against Supabase directly, as different seeded users | Testing RLS only through the app's API routes — a route bug can mask an RLS hole or vice versa |
| #2 | Triggering or viewing a plan for a `draft` or `submitted` (not yet `approved`) assessment is rejected end-to-end, for both the owning employee and any leader | "A 403/404 seen once in manual testing means the guardrail always holds" — must test at the exact transition boundary and via direct (non-UI) calls | The generate route's status check; whether the plan-fetch query itself re-checks approval status or just trusts a join | integration test | Testing only "assessment doesn't exist" instead of "assessment exists but isn't approved yet" — the more dangerous, more likely case |
| #3 | An approve/return request carrying extra fields (e.g. `score`) cannot alter anything beyond its intended column; a request referencing another user's assessment/plan ID is rejected | "The zod schema on the request body is the only defense" — must verify the actual DB write payload construction, not just input validation | Exact payload-construction code for the approve/return routes; current zod schemas | integration test posting an over-broad payload | Only testing that a well-formed payload succeeds — never testing one with unexpected/extra fields |
| #4 | Once `approved`, no action (including an out-of-order or repeated call, or a direct write bypassing app routes) can transition an assessment backward, self-escalate it, or mutate its scores | "The lock only needs testing via the normal UI sequence" — must hit the transition routes directly and out of the expected order; app routes rejecting bad sequences does not prove the underlying RLS `WITH CHECK` actually constrains the resulting status (research confirmed a live gap: `assessments_update_own_draft_only`'s WITH CHECK doesn't restrict target status, permitting employee self-approval via a direct write) | The exact `USING`/`WITH CHECK` clause per transition, verified against current migrations (research: `supabase/migrations/20260913150000_employee_self_assessment.sql:43-46`) | integration test calling approve/return/submit out-of-order against an already-approved assessment, PLUS a direct RLS-level write test (bypassing app routes) asserting an employee cannot set their own draft's status to anything but `submitted` | Testing only through app routes — every route here correctly rejects the bad transitions, which masks the actual RLS-level gap; also avoid testing only the happy-path sequence |
| #5 | For an approved assessment with known scores vs. expected levels, the generated plan's gap set and ranking match an independently computed expectation, and each recommended action references only its own gap | "The stub-mode test passing means the real-API path works too" — stub and real-API paths can diverge; also don't assume gaps are computed once and never re-derived incorrectly | The gap-computation entry point; the stub-vs-real-API contract; how `recommended_actions` is parsed/validated from the LLM response | unit test on gap computation (pure arithmetic) + integration test on the generate route in stub mode | Asserting against the LLM's exact prose (oracle problem) — assert structural properties (gap set, ranking, action count), not text content |
| #6 | Approving an assessment reliably results in exactly one plan reaching a terminal state; calling generate twice concurrently never creates two rows or fires two LLM calls | "It worked once in manual sequential testing, so the race is safe" — must verify the actual DB constraint under concurrency, not just observed sequential behavior | The generate route's conflict handling; whether the unique constraint is actually enforced by a migration; the fallback trigger's exact firing condition | integration test calling the generate route twice in parallel | Testing only the sequential case (call, wait, call again) — misses the actual concurrent race |
| #7 | Given a known set of a leader's direct reports with known approved gaps, the aggregated ranking matches an independently computed expected ranking, and a non-report never contributes to it | "If the numbers look plausible, the aggregation is correct" — must verify against an independently derived oracle, not the aggregation's own output; verify the leader-scoping boundary is airtight | The aggregation function's grouping/tie-break logic; what counts as "direct report"; whether unapproved/draft assessments are excluded | unit test with a hand-built fixture (multiple reports, known gaps, one intentional non-report) | Oracle problem — asserting the test expects whatever the function currently outputs, rather than an independently computed expected ranking |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Bootstrap + critical-path auth integrity | Stand up the test runner and test-user seed infra, then prove RLS locks, the approval guardrail, and status-lock invariants actually hold | #1, #2, #4 | unit + integration | complete | context/changes/testing-bootstrap-critical-path-auth-integrity/ |
| 2 | Approve/return payload tampering & IDOR | Prove leader review routes can't be tricked into writing beyond their intended columns, and cross-user IDs are rejected | #3 | integration | change opened | context/changes/testing-approve-return-payload-tampering-idor/ |
| 3 | AI plan generation correctness | Prove generated gaps/ranking match the real computed gap set, the eager+fallback trigger is race-safe, and recommended actions are relevant to their specific gap | #5, #6 | unit + integration + narrow AI-native judge | not started | — |
| 4 | Team-gap aggregation correctness | Prove the leader's "most common gaps" ranking matches an independently computed oracle and never includes a non-report | #7 | unit | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

Quality-gates wiring (lint + typecheck + unit/integration in CI) is folded
into Phase 1 rather than a separate phase — this is a solo, one-week PoC;
a dedicated gates phase would be overhead once Phase 1 already produces a
runnable suite.

## 4. Stack

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | none yet — see Phase 1 | Natural fit for an Astro/Vite project; no test runner installed today |
| RLS / DB integration | Supabase local (`npx supabase start`) + a seeded test-user set | n/a | No test-user seed infra exists yet (every archived plan for S-01/S-02/S-03 deferred this) — Phase 1 builds it |
| API mocking | none yet — see Phase 3 | — | Only needed to isolate the OpenRouter HTTP edge in Phase 3; the existing env-gated stub already covers most of this need |
| e2e | none — not proposed | — | No risk in §2 required full deployed-shape coverage; integration tests against Supabase directly are cheaper and sufficient |
| AI-native | narrow LLM-judge script — checked: 2026-09-14 | n/a | Used only in Phase 3, only against the real-API path, only to judge whether a recommended action is semantically relevant to its specific gap. When NOT to use: never in stub mode (deterministic output, no signal to gain); never for structural correctness (gap set/ranking — the classic layer already proves that) |

**Stack grounding tools (current session):**
- Docs: not available in current session (no Context7 or framework-docs MCP connected) — Vitest/Supabase-local recommendations are based on local manifest evidence (`package.json`, existing Astro/Vite config) only; checked: 2026-09-14
- Search: generic web search tool available in-session but not used for this pass — no stack-currency question arose that local evidence couldn't answer; checked: 2026-09-14
- Runtime/browser: no Playwright MCP in session; not used — no risk in §2 required full-browser coverage; checked: 2026-09-14
- Provider/platform: no GitHub/Cloudflare/Supabase MCP in session; not used — CI wiring in Phase 1 will reference the existing `.github/workflows/ci.yml` directly instead; checked: 2026-09-14

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI | required (already wired — `.github/workflows/ci.yml`) | syntactic / type drift |
| unit + integration | local + CI | required after §3 Phase 1 | logic and RLS/lock regressions |
| AI-native relevance judge | CI on PR touching plan-generation code, real-API path only | optional, required after §3 Phase 3 | generic/irrelevant recommended actions that structural assertions can't catch |
| e2e on critical flows | — | not planned | no risk in §2 required full deployed-shape coverage; integration against Supabase directly is the cheaper equivalent here |
| post-edit hook | — | not planned in this rollout | out of scope for this lesson (Module 3, Lesson 3) |
| pre-prod smoke | — | optional, unscheduled | no rollout phase currently points at this |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- TBD — see §3 Phase 1 (gap-computation arithmetic) and Phase 4 (team-gap aggregation) for the first reference tests.

### 6.2 Adding an integration test (RLS / route)

- **Location**: `tests/integration/`.
- **Naming**: `rls-<table-or-area>.test.ts` for RLS-focused tests (e.g. `rls-assessments.test.ts`), `routes-<flow>.test.ts` for route-handler tests (e.g. `routes-assessment-lifecycle.test.ts`).
- **Mocking policy**: RLS tests never mock Supabase — always sign in as a real seeded user (`tests/integration/helpers/supabase-test-client.ts`'s `signInAs`) and hit local Supabase directly, so RLS is genuinely exercised. Route-handler tests mock only `@/lib/supabase` (via `tests/integration/helpers/api-context.ts`'s `clientHolder` pattern) to inject that same signed-in client, skipping Astro's cookie-parsing plumbing — never mock Supabase itself. If the route imports anything reading `astro:env/server` (e.g. `@/lib/ai.ts`), mock that module directly too (see `routes-assessment-lifecycle.test.ts`).
- **Fixtures**: reuse `tests/integration/helpers/test-users.ts`'s `TEST_USERS`/`TEST_ASSESSMENTS` rather than hardcoding emails/UUIDs. If a test mutates a shared seeded row and no RLS-scoped client can revert it, add `afterEach` cleanup using `tests/integration/helpers/pg-admin.ts` (direct-Postgres, arrangement/cleanup only — never for the assertion itself) so repeated `npm run test` runs stay independent without requiring a fresh `db reset` each time.
- **Reference test**: `tests/integration/rls-assessments.test.ts` (RLS pattern), `tests/integration/routes-assessment-lifecycle.test.ts` (route-handler pattern).
- **Run locally**: `npx supabase start && npx supabase db reset && npm run test`.

### 6.3 Adding an e2e test

- Not planned in this rollout — see §4/§5 for why.

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 2 for the first payload-tampering / IDOR reference test.

### 6.5 Adding an AI-native relevance check

- TBD — see §3 Phase 3 for the first narrow LLM-judge pattern (real-API path only).

### 6.6 Per-rollout-phase notes

(Filled in as each phase lands.)

- **Phase 1** (`testing-bootstrap-critical-path-auth-integrity`): watch for RLS policies where `WITH CHECK` doesn't mirror the invariant `USING`/the migration's own comment implies — this bug shape hit this codebase three times (two caught before this rollout, one live security gap caught during Phase 1's research: an employee could self-approve their own draft assessment because `assessments_update_own_draft_only`'s `WITH CHECK` only checked `employee_id`, never the resulting `status`). When reviewing or writing a new RLS policy, always check `WITH CHECK` against the same invariant `USING` claims to enforce, not just that some `WITH CHECK` exists. Also: `development_plans`/`development_plan_gaps` have no `DELETE` policy by design ("plans are stable once created") — a test that creates one needs `pg-admin.ts` cleanup, not an RLS-scoped delete.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption
changes.

- **shadcn/ui component internals** — that's the library's job to test, not this project's. Re-evaluate only if a shadcn primitive is forked/customized beyond configuration. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-14
- Stack versions last verified: 2026-09-14
- AI-native tool references last verified: 2026-09-14

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
