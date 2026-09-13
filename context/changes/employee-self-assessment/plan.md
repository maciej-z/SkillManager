# Employee Self-Assessment Implementation Plan

## Overview

Let an Employee view the active competency model, start a self-assessment against it, score every competency (with an optional comment), save progress as a draft, and submit a completed assessment. This is roadmap item **S-01**, unlocking S-02 (leader review) and, downstream, S-03 (the AI-generated development plan).

## Current State Analysis

- F-01 shipped the schema/RLS/API/UI conventions this slice builds on: `public.profiles` (role/manager), `public.competency_models` (versioned, at most one `is_active`), `public.competencies` (1–5 expected proficiency), a `public.is_admin()` `security definer` helper, and a consistent API-route pattern (`export const prerender = false`, zod validation, a route-level role check backstopped by RLS).
- `src/middleware.ts` resolves `context.locals.profile` for every request and gates `/admin`; it does not yet gate any employee-only route (`PROTECTED_ROUTES = ["/dashboard", "/admin"]`).
- `src/pages/dashboard.astro` is a placeholder stub — no employee-facing domain UI exists yet.
- No `assessments` or per-competency score table exists yet.
- `src/components/ui/` has `badge`, `button`, `input`, `label`, `select`, `table` installed. No `radio-group` or `textarea` primitive yet.
- Each admin API route file re-declares its own `uuidLike` zod regex (Postgres's `uuid` type doesn't enforce RFC 4122 version/variant bits the way `z.uuid()` does) — this plan is the first to add a second consumer group (employee routes) for the same validation need.
- `supabase/seed.sql` seeds 2 employees (Alice, Bob) reporting to a junior leader, and one active competency model with 6 competencies — no assessment data yet.

### Key Discoveries:

- FR-003's Socrates note already resolves competency-model versioning for assessments: an assessment is tied to the specific `competency_models.id` active when it was created — later model changes never retroactively alter it. This plan does not need to invent that rule; it's given.
- FR-007's Socrates note already resolves "completed": submission requires a score on every competency in the assessment's model. No partial submits.
- `src/lib/supabase.ts:5-8` returns `null` when Supabase env vars are unset; every new route/page here must tolerate that the same way existing code does (503 from routes, empty/blocked state from pages).
- `context/foundation/lessons.md` documents a dev-only Astro SSR crash with radix-ui/shadcn primitives (first hit with `Select`). The new `radio-group` primitive is radix-backed too — treat this as a live risk, not a hypothetical (see Critical Implementation Details).

## Desired End State

- An Employee visiting `/assessment` sees one of: a "no competency model is active yet" message (no active model), a "start assessment" action (active model, no assessment yet), an in-progress scoring form (active model, draft assessment exists), or a read-only view of their locked scores (assessment submitted).
- `public.assessments` (one row per employee per competency-model version, `status` draft|submitted) and `public.assessment_scores` (one row per assessment per competency, score 1–5 + optional comment) exist, RLS-protected so an employee can only ever see/write their own rows, and so no row is writable once its assessment is `submitted`.
- The Employee can create an assessment, save any subset of scores as a draft repeatedly, and submit only once every competency in the model has a score — submission is a one-way transition enforced by both the route and RLS.
- `npx supabase db reset` applies cleanly with updated seed data exercising all three assessment states (none / draft / submitted) across the two seeded employees.

## What We're NOT Doing

- Not building any leader-facing review/approval UI or routes — that's S-02 (FR-008–012).
- Not building gap identification or AI plan generation — that's S-03 (FR-013–017).
- Not letting an employee un-submit or edit a submitted assessment — once locked, only a future S-02 leader "return for correction" flow can reopen it.
- Not retrofitting the existing admin routes to use the new shared `uuidLike` validation helper — this plan adds the helper and uses it in the new employee routes only; the existing duplication in `src/pages/api/admin/**` is left as-is to avoid unrelated churn.
- Not adding automated RLS integration tests (same rationale as F-01 — no test-user infra yet); verification is migration/seed apply + manual per-role checks.
- Not adding pagination or a history view across multiple competency-model versions — a given employee has at most one assessment per model version, and only one model is ever active, so there's nothing to paginate yet.

## Implementation Approach

Ship the schema and RLS first (Phase 1) so the assessment/score data model and its locking behavior are proven before anything depends on them. Then the API routes (Phase 2), since the UI needs a stable contract to call. Then the employee-facing UI (Phase 3), which also wires the one middleware route-protection line. Each phase is independently verifiable via `supabase db reset` + `npm run lint` + `npx astro check`.

## Critical Implementation Details

### RLS enforces the post-submit lock, not just the route

The `assessments` UPDATE policy's `USING` clause must require `status = 'draft'` on the *existing* row (not the incoming one): `using (employee_id = auth.uid() and status = 'draft') with check (employee_id = auth.uid())`. This is what makes the draft→submitted transition itself succeed (existing row is still draft) while rejecting every subsequent UPDATE attempt (existing row is now submitted) — the lock is real at the database layer, not just a client-side disabled button. `assessment_scores` INSERT/UPDATE policies must check the same condition through a subquery against the parent `assessments` row, since `status` doesn't live on the scores table.

### radio-group is a radix primitive — treat the dev-SSR lesson as live

`context/foundation/lessons.md` documents a dev-only Astro SSR crash the first time a radix-ui/shadcn primitive (`Select`) was used in a React island — mitigated there via `vite.optimizeDeps.include` pinning and, for one island, `client:only="react"`. The new `AssessmentForm` island uses `radio-group`, a different radix primitive with the same risk profile. Follow the lesson's rule: try `client:load` first (matches the existing `client:load` islands on `competency-models.astro`); if `astro dev` renders it blank or throws, fall back to `client:only="react"` for this island specifically, and separately confirm via `astro build && astro preview` that production is unaffected before treating either symptom as resolved.

### "Completed" is checked server-side too, not just via the disabled Submit button

The submit route must independently verify `count(assessment_scores for this assessment) === count(competencies for this assessment's model)` before flipping `status` to `submitted`, returning 400 with the missing-competency count otherwise. The disabled-Submit-button UX (from planning) is a fast-fail convenience, not the enforcement boundary — the same defense-in-depth pattern F-01 used for admin-role checks (route-level check backstopped by RLS) applies here to completeness.

## Phase 1: Database schema and RLS

### Overview

Introduce `assessment_status` enum, `assessments`, `assessment_scores`, RLS policies enforcing owner-only access and the post-submit lock, and updated seed data exercising all three assessment states.

### Changes Required:

#### 1. Schema migration

**File**: `supabase/migrations/20260913150000_employee_self_assessment.sql`

**Intent**: Establish the assessment/score schema and its locking RLS described in Desired End State.

**Contract**:
- `create type public.assessment_status as enum ('draft', 'submitted');`
- `public.assessments(id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.profiles(id) on delete cascade, competency_model_id uuid not null references public.competency_models(id), status public.assessment_status not null default 'draft', submitted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now())` with a unique constraint on `(employee_id, competency_model_id)`.
- `public.assessment_scores(id uuid primary key default gen_random_uuid(), assessment_id uuid not null references public.assessments(id) on delete cascade, competency_id uuid not null references public.competencies(id), score smallint not null check (score between 1 and 5), comment text, created_at timestamptz not null default now(), updated_at timestamptz not null default now())` with a unique constraint on `(assessment_id, competency_id)`.
- RLS enabled on both tables. `assessments`: SELECT/INSERT/UPDATE where `employee_id = auth.uid()`; the UPDATE policy's `USING` clause additionally requires `status = 'draft'` on the existing row (see Critical Implementation Details) — no DELETE policy. `assessment_scores`: SELECT/INSERT/UPDATE gated through an `exists` subquery against the parent `assessments` row (`assessment_id` matches, `employee_id = auth.uid()`), with INSERT/UPDATE additionally requiring the parent's `status = 'draft'` — no DELETE policy.

#### 2. Seed data update

**File**: `supabase/seed.sql`

**Intent**: Exercise all three assessment states across the two seeded employees so manual verification doesn't require creating data by hand.

**Contract**: Append after the existing competencies insert: Employee Alice gets a `draft` assessment against the active model with 2 of 6 competencies scored (exercises the in-progress/partial state); Employee Bob gets a `submitted` assessment with all 6 competencies scored and `submitted_at` set (exercises the locked/read-only state).

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies the migration and seed with exit code 0
- `npm run lint` passes
- `npx astro check` passes (0 errors)

#### Manual Verification:

- Open Supabase Studio locally, confirm Alice's assessment has 2 scored rows and `status = 'draft'`, Bob's has 6 scored rows and `status = 'submitted'` with `submitted_at` set
- As Bob (via a temporary Supabase-client check in browser devtools, or attempt an UPDATE through the app once Phase 2 lands), confirm his submitted assessment rejects further writes at the RLS layer

---

## Phase 2: Shared types and API routes

### Overview

Extend `src/types.ts` with the assessment shapes, extract the shared UUID validator, and add the three mutation routes an Employee's assessment flow needs: create, save scores, submit.

### Changes Required:

#### 1. Shared types

**File**: `src/types.ts`

**Intent**: Central types for `AssessmentStatus`, `Assessment`, `AssessmentScore` mirroring the Phase 1 tables' columns.

**Contract**: Export an `AssessmentStatus` union (`"draft" | "submitted"`) and interfaces mirroring `assessments` and `assessment_scores`.

#### 2. Shared UUID validator

**File**: `src/lib/validation.ts`

**Intent**: One `uuidLike` zod schema for the new employee routes, instead of a fourth copy-pasted regex (existing admin routes are left as-is — see What We're NOT Doing).

**Contract**: Export the same loose 8-4-4-4-12 hex-shape regex `uuidLike` already duplicated across `src/pages/api/admin/**`.

#### 3. Create assessment route

**File**: `src/pages/api/assessments/index.ts`

**Intent**: Let an authenticated Employee create their assessment against the currently active competency model.

**Contract**: `export const prerender = false;` `POST` handler. No request body needed — looks up the single `is_active = true` competency model server-side (400 if none active), inserts `{employee_id: context.locals.user.id, competency_model_id}` via the Supabase server client (the `(employee_id, competency_model_id)` unique constraint plus RLS's `employee_id = auth.uid()` check are the real enforcement; a pre-existing-assessment conflict surfaces as a 400 from the insert error).

#### 4. Save scores route

**File**: `src/pages/api/assessments/[id]/scores.ts`

**Intent**: Let the Employee save any subset of competency scores (with optional comments) for their own draft assessment in one call — the Save Draft action.

**Contract**: `export const prerender = false;` `PATCH` handler, zod schema validating `{ scores: Array<{ competency_id: string (uuid); score: number (1-5); comment?: string } > }` (min length 1). Route-level check that the target assessment's `employee_id` equals `context.locals.user.id` (fetch-then-compare) before upserting — 403 otherwise, fast-fail UX layer backstopped by RLS. Upserts each score via `on conflict (assessment_id, competency_id) do update`.

#### 5. Submit assessment route

**File**: `src/pages/api/assessments/[id]/submit.ts`

**Intent**: Transition a draft assessment to submitted, only once every competency in its model has a score.

**Contract**: `export const prerender = false;` `PATCH` handler. Route-level ownership check as above. Counts scored competencies for this assessment vs. total competencies for its `competency_model_id`; if they don't match, return 400 with the count of missing competencies. Otherwise updates `status = 'submitted'`, `submitted_at = now()`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro check` passes (0 errors)
- `npm run build` passes

#### Manual Verification:

- As Alice (draft, 2/6 scored), hit save-scores with the remaining 4 and confirm all 6 persist; hit submit and confirm it now succeeds
- As Alice with fewer than 6 scored, hit submit and confirm a 400 with the missing count, not a silent success
- As Bob (already submitted), hit save-scores or submit and confirm both are rejected (403/400, not a silent write)

---

## Phase 3: Employee UI

### Overview

The `/assessment` page and its scoring form, covering all four states from Desired End State, plus the one middleware line that protects the route.

### Changes Required:

#### 1. shadcn components

**Intent**: Add the two form primitives this screen needs that aren't installed yet.

**Contract**: `npx shadcn@latest add radio-group textarea`.

#### 2. Middleware route protection

**File**: `src/middleware.ts`

**Intent**: Gate `/assessment` the same way `/dashboard` and `/admin` already are.

**Contract**: Add `"/assessment"` to `PROTECTED_ROUTES`. No new role branch needed — any authenticated user (default role `employee`) may access it; a `competence_leader` or `admin` account can too, since PRD Access Control lets any role self-assess as an employee.

#### 3. Assessment page

**File**: `src/pages/assessment.astro`

**Intent**: Server-rendered state dispatch across the four Desired End State views.

**Contract**: Direct Supabase queries (matching the existing admin-page pattern) for: the active competency model + its competencies, and the current user's assessment (if any) + its scores (if any). Renders: no active model → plain message, no form; active model + no assessment → a "Start assessment" form posting to Phase 2's create route; active model + draft assessment → the `AssessmentForm` island; active model + submitted assessment → a read-only rendering of the same data (no island, no mutation affordance).

#### 4. Assessment form island

**File**: `src/components/assessment/AssessmentForm.tsx`

**Intent**: The scoring UI — one radio group (1–5) + optional comment textarea per competency, an inline "N of M scored" indicator, a Save Draft button (calls the scores route), and a Submit button (calls the submit route, disabled until N=M).

**Contract**: Local state per competency (score, comment); Save Draft posts the full current state to `PATCH /api/assessments/[id]/scores`; Submit posts to `PATCH /api/assessments/[id]/submit` and, on success, reloads to show the read-only submitted view. `client:load` per the codebase's default island pattern — see Critical Implementation Details for the fallback if the dev-SSR crash recurs.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro check` passes (0 errors)
- `npm run build` passes

#### Manual Verification:

- As an employee with no assessment yet, visit `/assessment`, click Start, confirm a draft assessment now exists and the scoring form renders
- Score fewer than all competencies, click Save Draft, reload the page, confirm the partial scores persisted and Submit is still disabled with an accurate "N of M" count
- Score every competency, confirm Submit becomes enabled, click it, confirm the page now shows the read-only submitted view
- As Bob (pre-seeded submitted), visit `/assessment` and confirm the read-only view renders with no editable controls
- Confirm `astro dev` renders the radio-group island correctly; if it doesn't, apply the `client:only="react"` fallback and separately verify `astro build && astro preview` still works

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None planned — no test runner is configured in this project yet; verification relies on lint/typecheck/build/migration-apply plus manual checks, consistent with F-01.

### Integration Tests:

- Not in scope (see What We're NOT Doing — RLS integration tests deferred, same rationale as F-01).

### Manual Testing Steps:

1. `npx supabase db reset` locally, confirm no errors.
2. Sign in as Alice (seeded draft), complete and submit her assessment.
3. Sign in as Bob (seeded submitted), confirm his assessment is read-only and rejects writes.
4. Sign in as a fresh employee with no assessment, confirm the "start assessment" flow works end to end.

## Performance Considerations

None specific — pilot-scale data (a handful of employees, one active model with under a dozen competencies each).

## Migration Notes

Additive migration on top of F-01's schema; no existing assessment data to migrate. `supabase/seed.sql` remains reset-only (not safe to re-run against a populated DB), consistent with F-01's Migration Notes.

## References

- Roadmap: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (FR-001–FR-007)
- Prior implementation: `context/archive/2026-09-13-role-and-competency-model-foundation/plan.md` (F-01 — schema/RLS/API conventions this plan follows)
- Lesson applied: `context/foundation/lessons.md` (React islands + shadcn/radix SSR crash in `astro dev`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database schema and RLS

#### Automated

- [x] 1.1 `npx supabase db reset` applies migration and seed with exit code 0 — 97aac55
- [x] 1.2 `npm run lint` passes — 97aac55
- [x] 1.3 `npx astro check` passes (0 errors) — 97aac55

#### Manual

- [x] 1.4 Supabase Studio: Alice's assessment shows 2/6 scored + draft, Bob's shows 6/6 scored + submitted — 97aac55
- [x] 1.5 Bob's submitted assessment rejects further writes at the RLS layer — 97aac55

### Phase 2: Shared types and API routes

#### Automated

- [x] 2.1 `npm run lint` passes
- [x] 2.2 `npx astro check` passes (0 errors)
- [x] 2.3 `npm run build` passes

#### Manual

- [x] 2.4 Alice can save remaining scores and then submit successfully
- [x] 2.5 Submitting with missing scores returns 400 with the missing count
- [x] 2.6 Bob's save-scores and submit requests are both rejected

### Phase 3: Employee UI

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npx astro check` passes (0 errors)
- [ ] 3.3 `npm run build` passes

#### Manual

- [ ] 3.4 Start-assessment flow works end to end for a fresh employee
- [ ] 3.5 Partial save persists correctly with an accurate N-of-M count and disabled Submit
- [ ] 3.6 Full scoring enables Submit and transitions to the read-only submitted view
- [ ] 3.7 Bob's pre-seeded submitted assessment renders read-only with no editable controls
- [ ] 3.8 `astro dev` renders the radio-group island correctly (or the documented fallback was applied and verified)
