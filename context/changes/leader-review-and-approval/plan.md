# Leader Review and Approval Implementation Plan

## Overview

Let a Competence Leader see the assessments their direct reports have submitted, review the employee's scores (view-only), add per-competency and overall review comments, and either approve the assessment or return it for correction. This is roadmap item **S-02**, unlocking S-03 (the AI-generated development plan, which can only ever consume an *approved* assessment).

## Current State Analysis

- S-01 shipped `public.assessments` (`status`: `'draft' | 'submitted'`) and `public.assessment_scores`, with RLS scoped entirely to `employee_id = auth.uid()` — a leader currently has zero visibility into a report's assessment at the database layer.
- F-01 already established the leader→report relationship (`profiles.manager_id`) and the exact RLS pattern for granting a leader read access to their direct reports' data (`profiles_select`'s `manager_id = auth.uid()` branch) — this plan extends the same relationship to `assessments`/`assessment_scores`.
- S-01's `assessments_update_own_draft_only` policy proved a reusable lock pattern: `USING (status = 'draft')` on the *existing* row makes a one-way transition succeed exactly once and reject every attempt after. This plan reuses the identical shape for the leader's submitted→approved/draft transition.
- No leader-facing route or page exists yet. `PROTECTED_ROUTES` in `src/middleware.ts` currently covers `/dashboard`, `/admin`, `/assessment` only.
- Seed data already provides a ready test fixture: Employee Bob's assessment is `submitted` (6/6 scored) reporting to Junior Leader; Employee Alice's is still `draft` (2/6 scored, correctly invisible to review). No seed changes are needed for this plan.
- `context/foundation/lessons.md` documents the React-island SSR risk (already mitigated project-wide via `vite.optimizeDeps.include`) — no new risk class introduced here since Phase 3 reuses only already-proven primitives (`Textarea`, `Button`).

### Key Discoveries:

- **Postgres enum-value gotcha**: `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction as a statement that references the new value (e.g., a `CHECK`/RLS policy comparing `status = 'approved'`). Supabase applies each migration file as one transaction, so adding `'approved'` to `assessment_status` and referencing it in RLS must be split across two migration files within Phase 1.
- **`profiles.manager_id` can change after the fact** (via F-01's admin panel), so a plain `manager_id = auth.uid()` check at read-time isn't sufficient to audit *who actually reviewed* a given assessment historically. `assessments` needs its own `reviewed_by`/`reviewed_at` snapshot, independent of the current manager_id.
- **RLS cannot restrict which columns an UPDATE touches.** The leader-review UPDATE policy on `assessment_scores` authorizes the whole row, not just `leader_comment` — so the API route (not RLS) is what prevents a leader from tampering with the employee's `score`/`comment` fields, by only ever including `leader_comment` in the route's update payload. This mirrors the existing "route is the fast-fail layer, RLS is the backstop" convention, just with the roles reversed for this one field-level concern.

## Desired End State

- A Competence Leader visiting `/reviews` sees a list of their direct reports' `submitted` assessments (draft and already-approved/returned-and-still-draft assessments do not appear); an empty list renders a plain "no reports awaiting review" message.
- Clicking into one opens `/reviews/[id]`, showing the employee's per-competency scores (read-only) with an editable per-competency leader-comment field, an overall leader-comment field, and Approve / Return for Correction actions.
- Approve saves the comments and transitions the assessment to `approved` — a terminal state; no leader or employee action can change it further.
- Return for Correction saves the comments and transitions the assessment back to `draft`, re-entering S-01's existing employee edit/submit flow unchanged, with the leader's comments still visible for context.
- `npx supabase db reset` applies cleanly; no existing S-01 data or seed changes are required.

## What We're NOT Doing

- Not building gap identification or AI plan generation — that's S-03 (FR-013–017).
- Not letting the leader edit the employee's own score — review is comment-only on top of the employee's existing self-rating (see Current State Analysis's schema decision).
- Not letting a leader "unapprove" an approved assessment — approval is a one-way transition, matching S-01's submit lock convention.
- Not adding a separate "save review progress" action for the leader — comments are saved together with the Approve/Return decision in one call, since the PRD describes a single review-then-decide flow, not an iterative multi-session draft like the employee's.
- Not building team-level competency gap coverage — `context/foundation/roadmap.md`'s `## Open Roadmap Questions` explicitly flags this as unassigned to any slice yet.
- Not adding a role-based route gate on `/reviews` — visibility is entirely data-scoped by `profiles.manager_id`, matching this codebase's existing principle that the manager relationship (not the `role` label) is the actual review authority. Any authenticated user without direct reports simply sees the empty state.
- Not adding automated RLS integration tests (same rationale as F-01/S-01 — no test-user infra yet); verification is migration/seed apply + manual per-role checks.

## Implementation Approach

Ship the schema and RLS first (Phase 1), reusing S-01's proven lock pattern for the new leader-facing transition. Then the two leader-gated API routes (Phase 2). Then the leader-facing UI (Phase 3), which also wires the one middleware route-protection line. Each phase is independently verifiable via `supabase db reset` + `npm run lint` + `npx astro check`.

## Critical Implementation Details

### Splitting the enum-value migration

`ALTER TYPE public.assessment_status ADD VALUE IF NOT EXISTS 'approved';` must be its own migration file, applied and committed before any later migration's RLS policy compares a column against `'approved'`. Phase 1 therefore ships two migration files, not one.

### The leader-review lock reuses S-01's exact pattern, with the roles swapped

The new `assessments` UPDATE policy for leaders must require `status = 'submitted'` on the *existing* row (not the incoming one) — this is what makes the first approve-or-return transition succeed while rejecting every attempt after (the row is no longer `'submitted'`). This is the identical shape as S-01's `assessments_update_own_draft_only`, just gating on the leader's `manager_id` relationship instead of the employee's ownership.

### Column-level tampering on `assessment_scores` is a route-level, not RLS-level, guarantee

See Key Discoveries above — the leader-review UPDATE policy on `assessment_scores` cannot itself stop a leader from writing to `score`. Both `approve.ts` and `return.ts` must build their `assessment_scores` update payload with only `{ leader_comment }`, never spreading request-body fields directly into the update call.

## Phase 1: Database schema and RLS

### Overview

Add the `approved` status value (in its own migration), the leader-review columns, and RLS policies granting a leader read/limited-write access to their direct reports' assessments and scores.

### Changes Required:

#### 1. Add the `approved` status value

**File**: `supabase/migrations/20260913160000_assessment_status_approved.sql`

**Intent**: Extend the status enum ahead of any statement that references the new value, avoiding the same-transaction enum gotcha.

**Contract**: `alter type public.assessment_status add value if not exists 'approved';` — this file contains nothing else.

#### 2. Leader review columns and RLS

**File**: `supabase/migrations/20260913160100_leader_review_and_approval.sql`

**Intent**: Add the leader-review data columns and the RLS policies granting leaders scoped access.

**Contract**:
- `alter table public.assessments add column leader_comment text, add column reviewed_by uuid references public.profiles(id), add column reviewed_at timestamptz;`
- `alter table public.assessment_scores add column leader_comment text;`
- New `assessments` SELECT policy for leaders: `using (status <> 'draft' and exists (select 1 from public.profiles p where p.id = assessments.employee_id and p.manager_id = auth.uid()))`.
- New `assessments` UPDATE policy for leaders: `using (status = 'submitted' and exists (select 1 from public.profiles p where p.id = assessments.employee_id and p.manager_id = auth.uid())) with check (exists (select 1 from public.profiles p where p.id = assessments.employee_id and p.manager_id = auth.uid()))` — the load-bearing `status = 'submitted'` on the existing row is what locks approval/return to a one-time transition (see Critical Implementation Details).
- New `assessment_scores` SELECT policy for leaders: same manager-relationship `exists` check, joined through the parent `assessments` row, with `assessments.status <> 'draft'`.
- New `assessment_scores` UPDATE policy for leaders: same manager-relationship `exists` check joined through the parent, additionally requiring the parent's `status = 'submitted'`.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies both migrations and the existing seed with exit code 0
- `npm run lint` passes
- `npx astro check` passes (0 errors)

#### Manual Verification:

- Open Supabase Studio locally, confirm `assessment_status` now has 3 values and the new columns exist on both tables
- As Junior Leader (Bob and Alice's manager), confirm a direct SELECT against `assessments` returns Bob's submitted assessment but not Alice's draft one
- As Senior Leader (not Bob/Alice's direct manager), confirm the same SELECT returns neither — the leader relationship must be direct, not transitive

---

## Phase 2: Shared types and API routes

### Overview

Extend `src/types.ts` with the new columns, and add the two leader-gated routes: approve and return-for-correction.

### Changes Required:

#### 1. Shared types

**File**: `src/types.ts`

**Intent**: Reflect Phase 1's schema additions.

**Contract**: Add `"approved"` to the `AssessmentStatus` union; add `leader_comment: string | null`, `reviewed_by: string | null`, `reviewed_at: string | null` to `Assessment`; add `leader_comment: string | null` to `AssessmentScore`.

#### 2. Approve route

**File**: `src/pages/api/reviews/[id]/approve.ts`

**Intent**: Save the leader's review comments and transition the assessment to `approved`.

**Contract**: `export const prerender = false;` `PATCH` handler. zod schema validating `{ leader_comment?: string; competency_comments: Array<{ competency_id: string (uuid); leader_comment: string }> }`. Route-level ownership check: fetch the assessment, fetch the employee's profile, confirm `profile.manager_id === context.locals.user.id` (403 otherwise) and `assessment.status === "submitted"` (409 otherwise) — fast-fail layer, RLS is the real boundary. Updates each named `assessment_scores` row with only `{ leader_comment }` (per Critical Implementation Details, never spreading the full request body). Updates `assessments` with `{ leader_comment, status: "approved", reviewed_by: context.locals.user.id, reviewed_at: now() }`, using `.select().maybeSingle()` on the result to distinguish a genuine update from an RLS-silenced no-op (mirrors `submit.ts`'s established defense against a false-positive success on a concurrent duplicate action) — 409 if the check comes back null.

#### 3. Return-for-correction route

**File**: `src/pages/api/reviews/[id]/return.ts`

**Intent**: Save the leader's review comments and transition the assessment back to `draft`.

**Contract**: Same shape as `approve.ts` — same zod schema, same ownership/status checks, same column-scoped `assessment_scores` update, same `.select().maybeSingle()` defense — except the `assessments` update sets `status: "draft"` instead of `"approved"`, and does not touch `submitted_at` (S-01's existing employee submit flow re-sets it when the employee resubmits).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro check` passes (0 errors)
- `npm run build` passes

#### Manual Verification:

- As Junior Leader, approve Bob's submitted assessment; confirm status is now `approved`, comments persisted, and a second approve/return attempt on the same assessment is rejected (409)
- As Junior Leader, return a submitted assessment for correction; confirm status is now `draft`, leader comments persisted and visible, and the employee can resume editing it via S-01's existing `/assessment` flow
- As Senior Leader (not Bob's direct manager) or as Alice (an employee, not Bob's manager), attempt to approve/return Bob's assessment and confirm both are rejected (403)

---

## Phase 3: Leader UI

### Overview

The `/reviews` queue page, the `/reviews/[id]` detail page, and the review form, plus the one middleware line that protects both routes.

### Changes Required:

#### 1. Middleware route protection

**File**: `src/middleware.ts`

**Intent**: Require authentication for the leader-facing routes, matching `/dashboard`/`/admin`/`/assessment`.

**Contract**: Add `"/reviews"` to `PROTECTED_ROUTES`. No role branch — visibility is entirely data-scoped (see What We're NOT Doing).

#### 2. Review queue page

**File**: `src/pages/reviews.astro`

**Intent**: List the current user's direct reports' `submitted` assessments.

**Contract**: Direct Supabase query (matching the established admin/assessment-page pattern) for `assessments` joined to `profiles` where `profiles.manager_id = user.id` and `status = 'submitted'` (RLS already scopes this, the query mirrors it for clarity). Each row links to `/reviews/[id]`. Empty result renders a plain "No reports awaiting review" message — no redirect (see Desired End State).

#### 3. Review detail page

**File**: `src/pages/reviews/[id].astro`

**Intent**: Server-rendered dispatch: render the review form while `submitted`, or a locked read-only view once `approved` (or if the id doesn't resolve to one of the leader's reports at all).

**Contract**: Direct Supabase queries for the assessment (via the id param), the employee's profile and competencies/scores for that assessment's model. If the assessment doesn't exist or isn't visible to this leader (RLS returns nothing), render a plain "not found" message. If `status === "submitted"`, render the `ReviewForm` island. If `status === "approved"`, render a read-only view (employee's scores + comments, leader's comments, `reviewed_at`) with no island.

#### 4. Review form island

**File**: `src/components/reviews/ReviewForm.tsx`

**Intent**: The review UI — the employee's score shown read-only per competency, an editable leader-comment field per competency, one overall leader-comment textarea, and Approve / Return for Correction buttons.

**Contract**: Local state per competency (leader comment) + overall comment. Approve posts the full current state to `PATCH /api/reviews/[id]/approve`; Return posts the same shape to `PATCH /api/reviews/[id]/return`. Both reload on success to show the resulting state. `client:load`, consistent with `AssessmentForm`'s already-proven island pattern (no new radix primitives introduced here, so the dev-SSR lesson doesn't apply).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro check` passes (0 errors)
- `npm run build` passes

#### Manual Verification:

- As Junior Leader, visit `/reviews`, confirm only Bob's submitted assessment appears (not Alice's draft one)
- Click into Bob's assessment, add per-competency and overall comments, click Approve; confirm the page now shows the locked read-only view
- Return a (freshly re-submitted) assessment for correction instead; confirm the employee sees it back in their `/assessment` draft flow with the leader's comments visible
- As Senior Leader, confirm `/reviews` shows an empty "no reports awaiting review" state (Bob and Alice are not their direct reports)
- As an Employee with no direct reports (e.g. Alice), confirm `/reviews` also shows the empty state rather than an error

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None planned — no test runner is configured in this project yet; verification relies on lint/typecheck/build/migration-apply plus manual checks, consistent with F-01/S-01.

### Integration Tests:

- Not in scope (see What We're NOT Doing — RLS integration tests deferred, same rationale as F-01/S-01).

### Manual Testing Steps:

1. `npx supabase db reset` locally, confirm no errors.
2. Sign in as Junior Leader, review and approve Bob's seeded submitted assessment.
3. Sign in as Alice, submit her assessment (via S-01's existing flow), then sign in as Junior Leader and return it for correction; confirm Alice sees it back in draft with the leader's comments.
4. Sign in as Senior Leader, confirm the review queue is empty (not Bob/Alice's direct manager).

## Performance Considerations

None specific — pilot-scale data (a handful of employees/leaders, at most a couple of pending reviews at once).

## Migration Notes

Two additive migrations on top of S-01's schema; no existing assessment data needs backfilling (existing rows are `'draft'`/`'submitted'`, both still valid values). `supabase/seed.sql` is unchanged — no new seed rows needed (see Current State Analysis).

## References

- Roadmap: `context/foundation/roadmap.md` (S-02)
- PRD: `context/foundation/prd.md` (FR-008–FR-012)
- Prior implementation: `context/changes/employee-self-assessment/plan.md` (S-01 — the lock pattern and defensive route conventions this plan reuses)
- Prior implementation: `context/archive/2026-09-13-role-and-competency-model-foundation/plan.md` (F-01 — the `manager_id`-based leader-visibility RLS pattern this plan extends)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database schema and RLS

#### Automated

- [ ] 1.1 `npx supabase db reset` applies both migrations and the existing seed with exit code 0
- [ ] 1.2 `npm run lint` passes
- [ ] 1.3 `npx astro check` passes (0 errors)

#### Manual

- [ ] 1.4 Supabase Studio: `assessment_status` has 3 values, new columns exist on both tables
- [ ] 1.5 Junior Leader's SELECT against assessments returns Bob's submitted assessment, not Alice's draft one
- [ ] 1.6 Senior Leader's SELECT returns neither (leader relationship must be direct)

### Phase 2: Shared types and API routes

#### Automated

- [ ] 2.1 `npm run lint` passes
- [ ] 2.2 `npx astro check` passes (0 errors)
- [ ] 2.3 `npm run build` passes

#### Manual

- [ ] 2.4 Junior Leader approves Bob's assessment; status becomes approved, comments persist, repeat attempt rejected (409)
- [ ] 2.5 Junior Leader returns a submitted assessment; status becomes draft, comments visible, employee can resume editing
- [ ] 2.6 A non-manager's approve/return attempt on Bob's assessment is rejected (403)

### Phase 3: Leader UI

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npx astro check` passes (0 errors)
- [ ] 3.3 `npm run build` passes

#### Manual

- [ ] 3.4 Junior Leader's /reviews shows only Bob's submitted assessment
- [ ] 3.5 Approving via the UI shows the locked read-only view afterward
- [ ] 3.6 Returning via the UI puts the assessment back in the employee's draft flow with leader comments visible
- [ ] 3.7 Senior Leader's /reviews shows the empty "no reports awaiting review" state
- [ ] 3.8 An employee with no direct reports also sees the empty state, not an error
