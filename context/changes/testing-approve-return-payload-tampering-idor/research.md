---
date: 2026-09-14T19:43:56+02:00
researcher: maciej-z
git_commit: b762848b57adf81e560044e6292b70837eb17a33
branch: master
repository: SkillManager
topic: "Approve/return payload tampering and IDOR test coverage (test-plan Phase 2, Risk #3)"
tags: [research, codebase, leader-review, approve, return, rls, idor, payload-tampering, zod]
status: complete
last_updated: 2026-09-14
last_updated_by: maciej-z
---

# Research: Approve/return payload tampering and IDOR test coverage

**Date**: 2026-09-14T19:43:56+02:00
**Researcher**: maciej-z
**Git Commit**: b762848b57adf81e560044e6292b70837eb17a33 (local, 1 commit ahead of `origin/master` — not yet pushed, so file paths are used instead of GitHub permalinks)
**Branch**: master
**Repository**: SkillManager

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md` (Risk #3): prove that an
approve/return request carrying extra fields (e.g. a `score`) cannot alter anything
beyond its intended column, and that a request referencing another user's
assessment cannot succeed. What is the exact current implementation of the
approve/return routes, their payload construction, their authorization check, the
backing RLS policies, and what does Phase 1's existing test suite already cover
vs. leave open?

## Summary

The two routes in scope — `src/pages/api/reviews/[id]/approve.ts` and
`src/pages/api/reviews/[id]/return.ts` — are structurally identical (only the
final `status` literal differs: `"approved"` vs `"draft"`). Both layers of
defense claimed by the archived design are confirmed present in current code:

1. **Schema layer**: the zod `reviewSchema` is a plain `z.object(...)`, not
   `.strict()` — Zod v4 silently strips unrelated top-level and nested keys
   during `safeParse` rather than rejecting the request. A `score` field
   anywhere in the payload never produces a 400.
2. **Payload-construction layer**: both routes build every `.update()` call
   from explicitly named fields only (`{ leader_comment: entry.leader_comment }`
   for `assessment_scores`; `{ leader_comment, status, reviewed_by, reviewed_at }`
   for `assessments`) — never `...parsed.data` or `...body`. This is the *real*
   defense against column tampering, since the backing RLS `UPDATE` policies are
   row-level only and cannot themselves restrict which column changes.
3. **IDOR / cross-user check**: an app-level `manager_id` lookup returns 403,
   but it is **effectively dead code** in production — the RLS `SELECT` policy
   on `assessments` already hides any row not owned by a report of the calling
   leader, so the assessment fetch itself returns null and the route's earlier
   404 branch fires first. This exact behavior (`leaderDana` vs `bobSubmitted`
   → 404 on both routes) is **already tested** in
   `tests/integration/routes-assessment-lifecycle.test.ts:69-95`.

**The genuinely uncovered risk is entirely the payload-tampering half of Risk #3.**
No existing test sends a payload with an extra/unexpected field (e.g. `score`
inside a `competency_comments[]` entry, or a bogus top-level key) through a real
route call and asserts the persisted row was unaffected — every existing test
either uses well-formed bodies or empty `competency_comments: []`. This was a
**named, accepted-as-code-discipline-only risk** in the archived
`leader-review-and-approval` plan itself (`plan-brief.md:62`: *"a future refactor
that spreads the raw request body into the update call would silently reopen
this gap"*), never converted into an automated regression test until now.

A concrete fixture problem must be solved before this can be tested: **the only
seeded assessment in `status = 'submitted'`** (the precondition both routes
require) **is `TEST_ASSESSMENTS.bobSubmitted`**, which existing tests already
depend on remaining `submitted` (e.g.
`routes-assessment-lifecycle.test.ts:103-115`). A tampering test that performs a
real approve/return call to observe the DB write would consume that fixture by
flipping its status. `TEST_ASSESSMENTS.chrisReturned` (currently `draft`, with
Chris managed by `juniorLeader`) is the best candidate for a self-contained
fixture: have Chris (`signInAs`) re-submit it via `submit.ts` to reach
`submitted`, run the tampering call as `juniorLeader`, assert the DB write, then
restore `status = 'draft'` via `pg-admin.ts`'s `forceAssessmentStatus` in
`afterEach` (the established Phase 1 cleanup convention).

## Detailed Findings

### The approve/return routes

Both files are byte-for-byte identical except the final status literal.

**Zod schema** — `src/pages/api/reviews/[id]/approve.ts:9-17` (identical in `return.ts:9-17`):
```ts
const reviewSchema = z.object({
  leader_comment: z.string().optional(),
  competency_comments: z.array(
    z.object({
      competency_id: uuidLike,
      leader_comment: z.string(),
    }),
  ),
});
```
Not `.strict()` at either the outer or the per-entry level. `zod` is pinned at
`^4.6.4` (`package.json`); Zod v4 `z.object()` strips unknown keys silently
rather than erroring on them (that's `.strict()`'s job). `uuidLike` is defined
at `src/lib/validation.ts:6-8` as a plain regex-validated string, not tied to
any particular table.

Parse call — `approve.ts:34` / `return.ts:34`:
```ts
const parsed = reviewSchema.safeParse(await context.request.json());
```

**Row selection and authorization** — identical in both files:
- Assessment id comes from the **route param**, not the body (`approve.ts:29`: `const assessmentId = context.params.id;`).
- `approve.ts:39-43` selects the assessment via the route's own signed-in Supabase client (`createClient(context.request.headers, context.cookies)`, `approve.ts:24`) — this is RLS-scoped to the calling leader, not a service-role client.
- `approve.ts:47-49`: 404 `{ error: "Assessment not found" }` if the select returns null.
- `approve.ts:51-58`: fetches `profiles` for `assessment.employee_id` to get `manager_id`.
- `approve.ts:59-62`:
  ```ts
  // RLS is the real enforcement boundary; this is a fast-fail UX layer.
  if (employeeProfile?.manager_id !== context.locals.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }
  ```
- `approve.ts:63-65`: 409 if `assessment.status !== "submitted"`.

**Payload-construction (the real column-tampering guard)** — `approve.ts:67-87`:
```ts
// Only ever send { leader_comment } here — never spread the raw request
// body — since RLS authorizes the whole assessment_scores row, not just
// this column (see plan's Critical Implementation Details).
for (const entry of parsed.data.competency_comments) {
  const { data: updatedScore, error } = await supabase
    .from("assessment_scores")
    .update({ leader_comment: entry.leader_comment })
    .eq("assessment_id", assessmentId)
    .eq("competency_id", entry.competency_id)
    .select("competency_id")
    .maybeSingle<{ competency_id: string }>();
  ...
}
```
and the assessment-row update, `approve.ts:94-104` (status literal is the only
diff vs. `return.ts:94-104`, which uses `"draft"`):
```ts
const { data: updated, error } = await supabase
  .from("assessments")
  .update({
    leader_comment: parsed.data.leader_comment ?? null,
    status: "approved",
    reviewed_by: context.locals.user.id,
    reviewed_at: new Date().toISOString(),
  })
  .eq("id", assessmentId)
  .select()
  .maybeSingle<Assessment>();
```
Every field in both `.update()` calls is either a named field pulled off
`parsed.data`/`entry`, or a server-computed value (`context.locals.user.id`,
`new Date().toISOString()`, the hardcoded status string). There is no `...`
spread anywhere in either route.

**Response codes** (identical in both routes): 401 unauthenticated, 503
Supabase not configured, 400 missing route param / zod failure / any DB error,
404 assessment not found, 403 manager mismatch (see IDOR analysis below — this
branch is unreachable in practice), 409 not-submitted / no matching score row /
lost-the-race (update affected 0 rows), 204 on success. **An extra/unexpected
field in the body never produces a distinct response** — zod silently drops it
and the request proceeds as if it weren't there.

### RLS policies backing these routes

`supabase/migrations/20260913160100_leader_review_and_approval.sql`:

- `assessments_update_leader_review` (lines 31-47): `USING (status = 'submitted' AND <manager_id = auth.uid() via profiles join>)`, `WITH CHECK (<same manager_id join, no status/column restriction>)`. Row-level only — cannot restrict which columns an authorized UPDATE touches.
- `assessment_scores_update_leader_review` (lines 65-83): same shape, joined through `assessments`. The migration's own comment (lines 61-64) states plainly: *"this policy authorizes the whole row, not just leader_comment — RLS has no column-level granularity. The API routes are what prevent a leader's update from touching `score`/`comment`."*
- `assessments_select_leader` (lines 14-23, original) required `status <> 'draft' AND manager_id = auth.uid()`; superseded by `supabase/migrations/20260913160200_leader_review_visibility_fix.sql:11-20`, which OR's in `reviewed_by = auth.uid()` (needed so a leader can still see a row they just flipped back to `draft` via return.ts) but **keeps the `manager_id = auth.uid()` AND-condition unconditional**. This is why a non-manager's `SELECT` always returns nothing regardless of the target row's status — confirmed against seed data below.

### The 403 branch is dead code in practice — the IDOR case is already tested

`tests/integration/routes-assessment-lifecycle.test.ts:69-95` already asserts,
for both `approve.ts` and `return.ts`, that `leaderDana` (not `bobSubmitted`'s
manager) gets **404**, not 403, with an explicit comment (`:62-68`) explaining
that RLS's `assessments_select_leader` hides the row before the route's own
manager-relationship check ever runs. Because `assessments_select_leader`'s
`manager_id = auth.uid()` condition is an unconditional AND (not gated by
status), this holds for *any* non-manager/any-status combination, not just this
one pair — so probing additional cross-manager pairs (e.g. `leaderGina` vs
`frankApproved`, confirmed by `supabase/seed.sql:85-91` to be managed by
`leaderDana`, not `leaderGina`) would reproduce the identical 404 result via
the identical mechanism, not surface new signal. **Risk #3's "a request
referencing another user's assessment ID is rejected" half is already covered**
by Phase 1; Phase 2's plan should note this as confirmed-covered rather than
re-derive it, and should scope its net-new integration test(s) to the
payload-tampering half.

Note also: Risk #3's wording in `test-plan.md` and `change.md` says
"assessment/plan ID" generically, but `approve.ts`/`return.ts` only ever take
an **assessment id** route param — there is no separate plan-id input on these
two routes for an IDOR test to target. (A plan-id IDOR concern, if any, belongs
to `src/pages/api/plans/[assessmentId]/generate.ts`, which is Phase 3's
concern per `test-plan.md` §3 row 3, not this phase's.)

### Fixture landscape (`tests/integration/helpers/test-users.ts`, `supabase/seed.sql`)

`TEST_USERS` (12 seeded accounts, shared password `pilot-password`) manager
relationships, confirmed directly against `supabase/seed.sql`:

| Leader | Reports | Source |
|---|---|---|
| `seniorLeader` | `juniorLeader` | seed.sql:26-27 |
| `juniorLeader` | `employeeAlice`, `employeeBob`, `employeeChris` | seed.sql:28-29, 152 |
| `leaderDana` | `employeeFrank`, `employeeGrace` | seed.sql:89-90 |
| `leaderGina` | `employeeHenry` | seed.sql:91 |
| `leaderIris` | *(none)* | seed.sql:88 (no employee references her id) |

`TEST_ASSESSMENTS` (`tests/integration/helpers/test-users.ts:24-31`) and their
**seeded status** (confirmed against `supabase/seed.sql`):

| Fixture | Employee | Status at seed time | Source |
|---|---|---|---|
| `aliceDraft` | Alice | `draft` | seed.sql:53 |
| `bobSubmitted` | Bob | **`submitted`** | seed.sql:54 |
| `chrisReturned` | Chris | `draft` (post-return; has existing `leader_comment`/`reviewed_by`/`reviewed_at`) | seed.sql:159 |
| `frankApproved` | Frank | `approved` | seed.sql:107 |
| `graceApproved` | Grace | `approved` | seed.sql:108 |
| `henryApproved` | Henry | `approved` | seed.sql:109 |

**`bobSubmitted` is the only seeded row in `submitted` status** — the
precondition both `approve.ts` and `return.ts` require (line 63-65 of each) to
do anything beyond a 409. Every other fixture is either `draft` or already
`approved`.

`tests/integration/routes-assessment-lifecycle.test.ts:103-115` already
depends on `bobSubmitted` staying `submitted` across the suite (it asserts
`generate.ts` returns 409 for it because it isn't approved yet). **A Phase 2
tampering test that performs a genuine approve/return call against
`bobSubmitted` to inspect the resulting DB row would flip its status and
silently break that other test** if it runs after Phase 2's test in the same
`npm run test` invocation (Vitest does not guarantee file-level ordering
independence here since both hit the same local Supabase instance without an
intervening `db reset`).

**Recommended fixture path** (not yet built, flagged for `/10x-plan`):
`chrisReturned` is `draft`, owned by `employeeChris`, managed by
`juniorLeader`. A test can: (1) sign in as `employeeChris` and call
`submit.ts` to flip it to `submitted` (this is a legitimate, already-covered
code path — no new route logic exercised); (2) sign in as `juniorLeader` and
call `approve.ts`/`return.ts` with a tampered payload; (3) assert the
resulting `assessment_scores.score` / any-extra-field is unchanged from its
seeded value via a fresh RLS-scoped read; (4) restore
`status = 'draft'` in `afterEach` via `pg-admin.ts`'s `forceAssessmentStatus`
(the exact pattern `rls-assessments.test.ts` already uses for its own
`aliceDraft` mutation). This avoids consuming the sole `submitted` fixture and
follows the project's established cleanup convention
(`test-plan.md` §6.2, impl-review F2).

### Existing test infrastructure to reuse (no new helpers required for the core test)

- `tests/integration/helpers/supabase-test-client.ts`'s `signInAs(email)` — returns a real, RLS-scoped `@supabase/supabase-js` client signed in as any `TEST_USERS` entry.
- `tests/integration/helpers/api-context.ts`'s `clientHolder` + `buildContext({ client, params, method, body })` — `vi.mock("@/lib/supabase", () => ({ createClient: () => clientHolder.current }))` swaps in the signed-in client; `buildContext` JSON-stringifies whatever `body` object is passed, so constructing an over-broad payload (extra `score` key, or an unexpected top-level field) requires no helper changes — just pass the tampered object as `body`.
- `tests/integration/helpers/pg-admin.ts`'s `forceAssessmentStatus(id, status)` — direct-Postgres, bypasses RLS, **arrangement/cleanup only, never for the assertion itself** (per the file's own header comment and `test-plan.md` §6.2). Needed for the `afterEach` restore described above.
- `tests/integration/helpers/test-users.ts`'s `TEST_USERS`/`TEST_ASSESSMENTS` — reuse `employeeChris`/`juniorLeader`/`chrisReturned` per above; no new fixture entries appear necessary for the core payload-tampering test.

### Naming/location convention (`test-plan.md` §6.2)

`routes-<flow>.test.ts` is the established naming for route-handler tests
(`routes-assessment-lifecycle.test.ts` is the existing example). Phase 2's new
coverage is a natural extension of the same `describe` file (it already
imports both `approve` and `return`) or a new sibling file, e.g.
`routes-review-tampering.test.ts` — either is consistent with the convention;
`/10x-plan` should decide based on how large the addition is.

### Why route-level enforcement is the intended permanent design, not a stopgap

The archived `leader-review-and-approval` slice (`context/archive/2026-09-13-leader-review-and-approval/`) treats route-level column tampering defense as a **permanent architectural characteristic**, not a temporary gap awaiting an RLS follow-up:

- `plan.md:20`: *"RLS cannot restrict which columns an UPDATE touches... This mirrors the existing 'route is the fast-fail layer, RLS is the backstop' convention, just with the roles reversed for this one field-level concern."*
- `plan.md:54-56` states it as a fact ("is a route-level, not RLS-level, guarantee") with no "for now"/"temporary" qualifier.
- `reviews/impl-review.md` finding **F5** generalizes the same limitation to the whole `assessments` row (not just `assessment_scores`) and was explicitly **skipped/accepted** as consistent with the project's pilot-scope risk model, with the only stated future trigger being a change in threat model ("if the threat model ever includes a malicious-insider leader") — not a planned RLS enhancement.
- `plan-brief.md:62` (Open Risks & Assumptions) is the plainest self-flag: *"The column-level tampering guard... is enforced entirely by the route's update payload shape, not by RLS — a future refactor that spreads the raw request body into the update call would silently reopen this gap."* This is precisely the regression Phase 2's test must guard against.
- No automated test coverage existed for approve/return at implementation time — `plan.md:216,220` explicitly deferred both unit and integration tests ("no test runner is configured in this project yet"); all verification was manual, one-time, and undocumented as a repeatable check (`plan.md:144-148`).
- The PRD (`context/foundation/prd.md:42-46`, `:99`) guardrails cover visibility scoping and approval-bypass, but say nothing about column-level payload integrity — that concern originates entirely from the implementation plan's own design reasoning about how Postgres RLS works, not from an explicit PRD requirement.

## Code References

- `src/pages/api/reviews/[id]/approve.ts:9-115` — full route, schema, auth check, payload construction
- `src/pages/api/reviews/[id]/return.ts:9-115` — identical structure, `status: "draft"`
- `src/lib/validation.ts:6-8` — `uuidLike` schema
- `supabase/migrations/20260913160100_leader_review_and_approval.sql:31-47` — `assessments_update_leader_review` policy
- `supabase/migrations/20260913160100_leader_review_and_approval.sql:61-83` — `assessment_scores_update_leader_review` policy + column-granularity comment
- `supabase/migrations/20260913160200_leader_review_visibility_fix.sql:11-20` — current `assessments_select_leader` policy
- `tests/integration/routes-assessment-lifecycle.test.ts:23-96` — existing status-transition + IDOR (404) coverage for approve/return
- `tests/integration/helpers/test-users.ts:1-32` — `TEST_USERS`/`TEST_ASSESSMENTS` fixtures
- `tests/integration/helpers/api-context.ts` — `clientHolder`/`buildContext` route-test harness
- `tests/integration/helpers/pg-admin.ts` — `forceAssessmentStatus` (arrangement/cleanup only)
- `supabase/seed.sql:24-33,85-95,106-109,151-159` — manager relationships and assessment statuses

## Architecture Insights

- The project consistently applies a "route is the fast-fail/UX layer, RLS is
  the backstop" convention — except for column-level tampering, where the
  roles are explicitly reversed (route is the *real* defense, RLS is only a
  row-level backstop) because Postgres RLS has no column granularity. Any
  future reviewer or refactor touching `approve.ts`/`return.ts` needs to know
  this inversion, since it's easy to "fix" by spreading the body for
  convenience and silently reopen the tampering gap.
- The app-level `manager_id`/403 check in both routes is currently unreachable
  via any RLS-respecting client (RLS's `SELECT` policy already filters the row
  out first, producing 404). It exists purely as documented defense-in-depth
  for a hypothetical future RLS regression, not as an independently exercised
  code path today.
- Test fixtures for `submitted`-status assessments are scarce by design (only
  one exists, `bobSubmitted`) because most fixtures are pre-shaped into their
  terminal display state for other pages' manual/e2e needs. Any future
  approve/return test needs to either mint a `submitted` row transiently (via
  a real `submit.ts` call on a `draft` fixture, cleaned up via `pg-admin.ts`)
  or the project should consider a dedicated pg-admin insert/delete helper —
  the former requires no new helper code and matches Phase 1's existing
  conventions more closely.

## Historical Context (from prior changes)

- `context/archive/2026-09-13-leader-review-and-approval/plan.md`,
  `plan-brief.md`, `reviews/impl-review.md` — original design and review of
  the approve/return feature; source of the "route-level, not RLS-level"
  self-identification that grounds Risk #3, and confirms no automated test
  ever existed for this feature.
- `context/changes/testing-bootstrap-critical-path-auth-integrity/plan.md`,
  `research.md`, `reviews/impl-review.md` — Phase 1 built the test-user seed
  infra and RLS/route test harness this phase reuses, and already produced
  the one existing IDOR-adjacent test (404 for `leaderDana` vs `bobSubmitted`)
  as an incidental byproduct of testing status-transition rejection, not as a
  deliberate Risk #3 test.
- `context/foundation/test-plan.md` §2 Risk #3 and its Risk Response Guidance
  row (table, "Must challenge" / "Anti-pattern to avoid" columns) — the
  authoritative scope and challenge framing for this phase; confirmed by this
  research to already hold true in current code for the column-tampering
  claim (payload construction is safe *today*) and to already have partial
  automated coverage for the IDOR claim (via Phase 1's incidental test).

## Related Research

- None yet under `context/changes/**/research.md` specific to this topic beyond this document.

## Open Questions

- Should the new test(s) live in `routes-assessment-lifecycle.test.ts` (extending the existing `describe` blocks that already import `approve`/`return`) or a new sibling file (`routes-review-tampering.test.ts`)? Both are convention-consistent; a plan decision, not a research one.
- Is a single tampering test sufficient (extra field inside `competency_comments[].score`), or should the plan also cover a bogus top-level field (e.g. `{ status: "approved", ...validBody }`) as a second scenario? The zod-strip mechanism and the payload-construction guard both apply identically to either shape, but a plan may want both for defense-in-depth documentation even though the underlying code path is the same.
- Given the 403 branch is dead code today, does Phase 2's plan want a narrow unit-level or direct-call test asserting the 403 path itself (e.g. by constructing a scenario where RLS is bypassed at the test level to reach it), or is that out of scope as "testing code that can't currently execute in production"? Leaning toward out-of-scope per `test-plan.md` §1 principle #1 (cost × signal) — the RLS-level 404 behavior is what actually matters and is already proven.
