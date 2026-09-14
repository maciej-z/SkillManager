# AI Development Plan Implementation Plan

## Overview

Let an Employee (and their Competence Leader) view an AI-generated development plan once the leader approves the assessment: the employee's competency gaps ranked largest to smallest, with the top 3 paired with concrete AI-generated recommended actions. This is roadmap item **S-03** — the PoC's north star, since the Secondary Success Criterion (leaders find the plan genuinely useful, not generic) rides entirely on this slice.

## Current State Analysis

- No AI provider integration exists anywhere in this codebase — no SDK dependency, no API key in `.dev.vars`/`.env.example`, nothing in `astro.config.mjs`'s env schema. The PRD deliberately deferred this exact choice to this plan.
- S-02 shipped `assessments` (status now `'draft' | 'submitted' | 'approved'`) and `assessment_scores` (employee's own score per competency), both RLS-scoped to the employee and their direct manager (`profiles.manager_id`).
- `context/foundation/infrastructure.md` already flags real constraints for this exact feature: Cloudflare Workers has no background-job primitive (a slow LLM call blocks the request thread) and bills CPU-ms rather than wall-clock time — its Risk Register explicitly says to "keep in-Worker synchronous work around the LLM call minimal" for this feature.
- `assessment.astro`'s and `reviews/[id].astro`'s existing `"approved"` branches (from S-02) already render a read-only view of the approved assessment — this plan extends both, it doesn't build new pages.
- `ReviewForm.tsx`'s `handleDecision("approve")` already exists as the point where an assessment transitions to `approved` — the natural place to eagerly kick off plan generation.

### Key Discoveries:

- **Gap identification (FR-013/014) is plain arithmetic, not an AI task** — comparing `assessment_scores.score` against `competencies.expected_proficiency_level` for the approved assessment. Only the natural-language recommended actions (FR-015) genuinely need the LLM; keeping the model's job narrowly scoped to that one text-generation step matches the PRD's own "no bespoke recommendation engine" framing.
- **"Identified competency gaps" only includes competencies where `score < expected_proficiency_level`** — a competency the employee met or exceeded isn't a gap at all and doesn't appear in the ranked list. This resolves what "ranked largest to smallest" would otherwise leave ambiguous at the boundary.
- **Workers' unique-constraint-based race safety**: since generation can be triggered from two places (the leader's approve action, and a view-time fallback), the `development_plans` table needs a `unique (assessment_id)` constraint so a race between the two triggers can't create two competing generation attempts — whichever request's insert lands first "claims" generation; the other sees the conflict and just re-reads the current state.
- **`src/lib/supabase.ts`'s null-tolerant pattern is the model for AI-provider optionality**: when `OPENROUTER_API_KEY` is unset, generation returns a canned deterministic stub plan instead of calling the real API — same convention already established for Supabase, letting the full pending→ready UI flow be exercised with zero API cost during development.

## Desired End State

- Once a leader approves an assessment, a development plan is generated (via an eager trigger from the approve action, with a view-time fallback trigger if that didn't fire or failed) without ever blocking the approve request itself on LLM latency.
- Both `assessment.astro`'s and `reviews/[id].astro`'s approved views show: the plan's identified gaps ranked largest to smallest, with the top 3 (or fewer, if there are fewer than 3 actual gaps) each showing 2-3 concrete AI-generated recommended actions. A `"pending"` plan shows a generating message; a `"failed"` plan shows the error and a retry action, available to either the employee or the leader.
- `npx supabase db reset` applies cleanly; existing S-01/S-02 seed data (Bob's already-approved-in-testing assessment) is extended so at least one seeded assessment is `approved` with the seed itself exercising the full plan lifecycle isn't required — generation happens live, not via seeded plan rows.

## What We're NOT Doing

- Not building a standalone `/plan` route — the plan renders inside the existing approved-assessment views (employee's `/assessment`, leader's `/reviews/[id]`), per the recommended UI decision.
- Not building automatic background retries for a failed generation — a failed plan is retried by the employee or leader revisiting the page (or clicking Retry), matching the "no background-job primitive" constraint already documented for this platform.
- Not letting an employee or leader regenerate a `"ready"` plan — once generated successfully, it's stable; there's no feedback loop or "give me another attempt" action (matches the PRD's Non-Goal: no employee feedback/rating on the generated plan).
- Not building team-level competency gap coverage or plan aggregation across reports — out of scope per `roadmap.md`'s `## Open Roadmap Questions`.
- Not adding a real-time/polling mechanism for the pending state — `tech-stack.md` records `has_realtime: false`; the pending view simply asks the user to check back / reload.
- Not adding automated integration tests for the AI call itself (no test runner in this project yet); verification is the env-gated stub path plus one manual pass against the real API before treating the feature as done.

## Implementation Approach

Ship the schema and RLS first (Phase 1), reusing the employee-or-manager visibility shape already proven in S-01/S-02. Then the AI integration, gap computation, and the single generation API route (Phase 2) — this is where the OpenRouter call, the stub fallback, and the race-safe idempotency live. Then the UI (Phase 3): one shared plan-view component wired into both existing approved views, plus the one-line addition to `ReviewForm.tsx`'s approve handler that eagerly triggers generation. Each phase is independently verifiable via `supabase db reset` + `npm run lint` + `npx astro check`.

## Critical Implementation Details

### The generation route must be race-safe without a job queue

Two independent triggers (the leader's eager post-approve call, and a view-time fallback from either role) can both attempt to start generation for the same assessment. The route must attempt an `insert` with `on conflict (assessment_id) do nothing` as its first write; if the row already existed (conflict), re-fetch and return its current state instead of proceeding to call the LLM a second time. This is the only concurrency-safety mechanism available on a platform with no locks/queues, and it must be the very first thing the route does after validating the caller.

### The prompt must ground every recommended action in real data — never open-ended

Per the PRD's guardrail ("recommended actions must relate to the employee's actual approved gaps... not wildly irrelevant"), the prompt sent to the model must explicitly enumerate: the specific gap's competency name, description, expected level, and actual score, plus the employee's full set of other competency scores for context (per the answered "prompt context richness" decision) — never a vague "give this person career advice" prompt. The model's response must be requested as structured JSON (an array of gaps, each with 2-3 action strings) so it can be parsed deterministically, not free text requiring fuzzy extraction.

### Eager trigger is fire-and-forget from the approve action; it must never block the approve response

`ReviewForm.tsx`'s `handleDecision("approve")` fires the generation POST *after* the approve call already succeeded and *without awaiting it* before reloading — a slow or failed generation attempt must never delay or fail the approve action itself. The view-time fallback (triggered when an approved-view page loads and finds no plan row yet) is what makes this safe to fire-and-forget: if the eager call is lost (page navigates away mid-request, network blip), the next visit to either approved view picks it up.

## Phase 1: Database schema and RLS

### Overview

Add `development_plans` and `development_plan_gaps` tables with RLS mirroring the employee-or-manager visibility already established for `assessments`/`assessment_scores`, gated on the parent assessment being `approved`.

### Changes Required:

#### 1. Schema migration

**File**: `supabase/migrations/20260914090000_ai_development_plan.sql`

**Intent**: Establish the development-plan data model and its RLS.

**Contract**:
- `create type public.development_plan_status as enum ('pending', 'ready', 'failed');`
- `public.development_plans(id uuid primary key default gen_random_uuid(), assessment_id uuid not null references public.assessments(id) on delete cascade, status public.development_plan_status not null default 'pending', raw_response text, error_message text, generated_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now())` with a unique constraint on `(assessment_id)` (the race-safety mechanism from Critical Implementation Details).
- `public.development_plan_gaps(id uuid primary key default gen_random_uuid(), development_plan_id uuid not null references public.development_plans(id) on delete cascade, competency_id uuid not null references public.competencies(id), gap_size smallint not null check (gap_size > 0), rank smallint not null, recommended_actions jsonb, created_at timestamptz not null default now())` with a unique constraint on `(development_plan_id, competency_id)`.
- RLS enabled on both tables. `development_plans`/`development_plan_gaps` SELECT: visible where the joined assessment's `employee_id = auth.uid()` OR the joined assessment's employee has `manager_id = auth.uid()` (the same two-branch shape as `assessments_select_own`/`assessments_select_leader` combined, joined through `assessments`). INSERT/UPDATE on `development_plans`: allowed for the same employee-or-manager relationship, additionally requiring the parent assessment's `status = 'approved'`. INSERT on `development_plan_gaps`: same employee-or-manager relationship via the parent `development_plans` → `assessments` join. No DELETE policy on either table (plans are stable once created, per What We're NOT Doing).

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies the migration and existing seed with exit code 0
- `npm run lint` passes
- `npx astro check` passes (0 errors)

#### Manual Verification:

- Open Supabase Studio locally, confirm both new tables exist with the stated columns and the `unique (assessment_id)` constraint on `development_plans`
- As the employee whose assessment is approved (or their manager), confirm a direct SELECT/INSERT against `development_plans` succeeds when `assessments.status = 'approved'`
- As an unrelated employee or leader, confirm the same SELECT returns nothing

---

## Phase 2: AI integration, gap computation, and generate route

### Overview

The OpenRouter client (with an env-gated stub), the gap-computation logic, shared types, and the single idempotent `POST /api/plans/[assessmentId]/generate` route.

### Changes Required:

#### 1. Environment variable

**File**: `astro.config.mjs`

**Intent**: Register the AI provider's API key the same way `SUPABASE_URL`/`SUPABASE_KEY` are already registered.

**Contract**: Add `OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true })` to the existing `env.schema` block. Update `.env.example` with an `OPENROUTER_API_KEY=###` placeholder line (never a real key).

#### 2. AI client with stub fallback

**File**: `src/lib/ai.ts`

**Intent**: One function that either calls OpenRouter or returns a deterministic stub, so the rest of the app never needs to know which happened.

**Contract**: Export `generateDevelopmentPlanActions(gaps: { competency: Competency; score: number }[], allScores: { competency: Competency; score: number }[]): Promise<{ raw: string; actionsByCompetencyId: Record<string, string[]> }>`. When `OPENROUTER_API_KEY` (via `astro:env/server`) is unset, returns a canned deterministic response (2-3 generic-but-plausible action strings per gap, and a raw string noting it's a stub) without any network call — mirrors `src/lib/supabase.ts`'s null-return convention. When the key is set, calls `https://openrouter.ai/api/v1/chat/completions` via plain `fetch` (no SDK, per infrastructure.md's `nodejs_compat`-risk note) with a prompt enumerating each gap's competency name/description/expected level/actual score plus the full `allScores` list for context (per Critical Implementation Details), requesting a JSON response body; parses and returns it, throwing on a malformed/unparseable response so the caller can mark the plan `failed`.

#### 3. Shared types

**File**: `src/types.ts`

**Intent**: Central types for the new tables.

**Contract**: Export `DevelopmentPlanStatus` union (`"pending" | "ready" | "failed"`) and interfaces `DevelopmentPlan` and `DevelopmentPlanGap` mirroring the Phase 1 tables' columns.

#### 4. Generate route

**File**: `src/pages/api/plans/[assessmentId]/generate.ts`

**Intent**: The single entry point for triggering generation, safe to call idempotently from either the eager or the fallback trigger.

**Contract**: `export const prerender = false;` `POST` handler. Fetches the target `assessments` row and its employee's `profiles` row; 403 unless the caller is the employee themselves or the employee's `manager_id`; 409 unless `assessment.status === "approved"`. Attempts `insert` on `development_plans` with `{ assessment_id }` and `on conflict (assessment_id) do nothing`; if the row already existed, re-`select`s it and returns its current status immediately (race-safety, per Critical Implementation Details) — only a freshly-inserted row proceeds to generation. Computes gaps: for every competency in the assessment's model, `gap_size = expected_proficiency_level - score` where positive; sorts descending by `gap_size`, ties broken by the competency's own creation order (no re-sort beyond the primary key); takes the top 3 (or fewer) for action generation. Calls `generateDevelopmentPlanActions`; on success, inserts one `development_plan_gaps` row per identified gap (ranked ones carrying `recommended_actions`, the rest `null`) and updates `development_plans` to `{ status: "ready", raw_response, generated_at: now() }`; on any failure (LLM call throws, zero gaps found and that's itself not an error — see below), updates `development_plans` to `{ status: "failed", error_message }`. A zero-gap result (employee met or exceeded every competency) is not a failure — it updates straight to `{ status: "ready" }` with no `development_plan_gaps` rows, and the UI (Phase 3) renders a "no gaps identified" state for that case.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro check` passes (0 errors)
- `npm run build` passes

#### Manual Verification:

- With `OPENROUTER_API_KEY` unset, trigger generation for an approved assessment and confirm a stub plan is created with `status = "ready"`, gaps ranked correctly, and 2-3 stub actions on the top 3
- Trigger generation twice in a row (simulating the eager + fallback race) and confirm the second call returns the existing plan rather than creating a duplicate or calling the stub/API twice
- Attempt to trigger generation for a `submitted` (not yet approved) assessment and confirm it's rejected (409)
- As an unrelated employee or leader, attempt to trigger generation and confirm it's rejected (403)
- With a real `OPENROUTER_API_KEY` set, trigger generation once and confirm a genuine LLM-generated plan is produced and parsed correctly

---

## Phase 3: Development plan UI

### Overview

One shared plan-view component rendering pending/ready/failed states, wired into both existing approved views, plus the eager trigger from the leader's approve action.

### Changes Required:

#### 1. Shared plan-view component

**File**: `src/components/plan/DevelopmentPlanView.tsx`

**Intent**: The one place that renders a development plan's current state and offers a retry/generate action, reused by both the employee and leader surfaces.

**Contract**: Props: `assessmentId`, `plan: DevelopmentPlan | null`, `gaps: (DevelopmentPlanGap & { competency: Competency })[]`. If `plan` is null or `status === "pending"`, shows a generating/not-yet-started message plus a button that `POST`s to `/api/plans/[assessmentId]/generate` and reloads on success (this is the view-time fallback trigger). If `status === "failed"`, shows `error_message` and a Retry button (same POST). If `status === "ready"`, renders the ranked gap list (competency name, gap size) with the top-ranked ones' `recommended_actions` as a bullet list; a `ready` plan with zero gaps renders a "met or exceeded every competency — no gaps identified" message. `client:load`, consistent with this codebase's established island pattern.

#### 2. Employee view integration

**File**: `src/pages/assessment.astro`

**Intent**: Show the development plan inside the existing `"approved"` branch.

**Contract**: Fetch the `development_plans` row (if any) and its `development_plan_gaps` (joined with `competencies`) for the current assessment; render `DevelopmentPlanView` beneath the existing approved-assessment read-only block.

#### 3. Leader view integration

**File**: `src/pages/reviews/[id].astro`

**Intent**: Show the same development plan inside the existing `"approved"` branch, for the leader.

**Contract**: Same data-fetching and `DevelopmentPlanView` usage as the employee view.

#### 4. Eager trigger on approval

**File**: `src/components/reviews/ReviewForm.tsx`

**Intent**: Kick off generation immediately when a leader approves, without ever blocking or risking the approve action itself.

**Contract**: In `handleDecision`, when `action === "approve"` and the approve call succeeds, fire (but do not `await`, and ignore its result/errors) a `POST` to `/api/plans/[assessmentId]/generate` before the existing `window.location.reload()` call — per Critical Implementation Details, this must never delay or fail the approve flow itself.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro check` passes (0 errors)
- `npm run build` passes

#### Manual Verification:

- As a leader, approve a submitted assessment; confirm the reload shows the plan either already generating or already ready (stub mode) shortly after
- As the employee, visit `/assessment` for that now-approved assessment and confirm the same plan (ranked gaps, top-3 actions) renders there too
- Force a `"failed"` state (e.g., temporarily point the stub/API path at something that errors) and confirm both the employee's and leader's views show the error and a working Retry button
- Confirm an assessment with zero actual gaps (all scores meet or exceed expected) renders the "no gaps identified" state cleanly on both views

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None planned — no test runner is configured in this project yet; verification relies on lint/typecheck/build/migration-apply plus manual checks (stub-mode and one real-API pass), consistent with F-01/S-01/S-02.

### Integration Tests:

- Not in scope (see What We're NOT Doing — automated AI-call testing deferred; the env-gated stub is the testable substitute).

### Manual Testing Steps:

1. `npx supabase db reset` locally, confirm no errors.
2. With `OPENROUTER_API_KEY` unset, approve an assessment as a leader and confirm the stub plan appears correctly on both the leader's and employee's views.
3. Force a failure and confirm the Retry flow works from both views.
4. With a real `OPENROUTER_API_KEY` set, do one full pass to confirm the real integration produces a sensible, grounded plan.

## Performance Considerations

Generation is decoupled from the approve request specifically to avoid the Cloudflare Workers CPU-ms/blocking risk `infrastructure.md` already flagged for this feature — the approve action's own request stays fast regardless of LLM latency.

## Migration Notes

Additive migration on top of S-01/S-02's schema; no existing assessment data needs backfilling. No seed changes — plan generation is exercised live (stub or real) during manual verification, not via pre-seeded plan rows.

## References

- Roadmap: `context/foundation/roadmap.md` (S-03)
- PRD: `context/foundation/prd.md` (FR-013–FR-017, US-01)
- Infrastructure research: `context/foundation/infrastructure.md` (Workers CPU-ms/blocking risk for this exact feature)
- Prior implementation: `context/changes/leader-review-and-approval/plan.md` (S-02 — the employee-or-manager RLS shape and the approve-action integration point this plan extends)
- Prior implementation: `context/changes/employee-self-assessment/plan.md` (S-01 — the null-tolerant optional-integration convention this plan reuses for the AI provider)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database schema and RLS

#### Automated

- [x] 1.1 `npx supabase db reset` applies the migration and existing seed with exit code 0 — 3549568
- [x] 1.2 `npm run lint` passes — 3549568
- [x] 1.3 `npx astro check` passes (0 errors) — 3549568

#### Manual

- [x] 1.4 Supabase Studio: both new tables exist with the stated columns and the unique (assessment_id) constraint — 3549568
- [x] 1.5 Employee/manager SELECT+INSERT against development_plans succeeds when the assessment is approved — 3549568
- [x] 1.6 An unrelated employee/leader's SELECT returns nothing — 3549568

### Phase 2: AI integration, gap computation, and generate route

#### Automated

- [x] 2.1 `npm run lint` passes — 2132244
- [x] 2.2 `npx astro check` passes (0 errors) — 2132244
- [x] 2.3 `npm run build` passes — 2132244

#### Manual

- [x] 2.4 Stub-mode generation for an approved assessment produces a ready plan with correctly ranked gaps and 2-3 stub actions on the top 3 — 2132244
- [x] 2.5 Triggering generation twice in a row doesn't duplicate the plan or double-call the stub/API — 2132244
- [x] 2.6 Generation for a non-approved assessment is rejected (409) — 2132244
- [x] 2.7 Generation attempted by an unrelated employee/leader is rejected (404 — RLS hides the row entirely, same accepted pattern as S-02's approve/return routes; not 403 as originally worded) — 2132244
- [x] 2.8 A real OPENROUTER_API_KEY produces a genuine, correctly parsed LLM plan — 2132244

### Phase 3: Development plan UI

#### Automated

- [x] 3.1 `npm run lint` passes
- [x] 3.2 `npx astro check` passes (0 errors)
- [x] 3.3 `npm run build` passes

#### Manual

- [x] 3.4 Approving as a leader results in the plan appearing (generating or ready) on reload
- [x] 3.5 The employee's own /assessment view shows the same plan
- [x] 3.6 A forced failure shows the error + a working Retry on both views
- [x] 3.7 A zero-gap assessment renders the "no gaps identified" state cleanly on both views
