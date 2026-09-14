# Leader Team Gap View Implementation Plan

## Overview

Give a Competence Leader a read-only, post-login landing page at `/dashboard` ranking the most common competency gaps across their direct reports' approved assessments, with a link into the review queue (`/reviews`). This is roadmap item **S-04** — the north star of milestone M-2, extending the PoC's leader-usefulness bet from a single approved assessment (S-03) to the team level.

## Current State Analysis

- `src/pages/dashboard.astro` is today a single generic "Welcome, {email}" page with a sign-out button — no role branching at all.
- No aggregation/ranking pattern exists anywhere in this codebase yet; every prior read (assessment scores, review queue, development plan gaps) is scoped to one assessment at a time.
- `src/pages/reviews.astro:17-28` already establishes the exact query shape needed for "all of a leader's direct reports": `assessments` joined with `profiles!assessments_employee_id_fkey!inner(*)`, filtered by `employee.manager_id = user.id`.
- Gap computation is plain arithmetic, already proven in `src/pages/api/plans/[assessmentId]/generate.ts:127-134`: a gap exists where `score < competency.expected_proficiency_level`, with `gap_size = expected - score`.
- `src/components/ui/table.tsx` (shadcn Table) is already used for list rendering in `src/components/admin/ProfilesTable.tsx`; no client-side interactivity is needed here, so this stays plain Astro markup, not a React island (matches this codebase's "React only when interactive" convention).

### Key Discoveries:

- **RLS already fully covers this feature — no migration needed.** `assessments_select_leader` and `assessment_scores_select_leader` (from S-02, `supabase/migrations/20260913160200_leader_review_visibility_fix.sql` and `20260913160300_leader_review_scores_visibility_fix.sql`) already let a leader read every non-draft assessment and its scores for every one of their direct reports — not just one at a time. `competencies_select_authenticated` already lets any authenticated user read the competency catalog.
- **Recompute gaps directly from `assessment_scores` + `competencies` — do not depend on `development_plans`/`development_plan_gaps` from S-03.** Gap identification is pure arithmetic and was deliberately kept independent of whether AI plan generation has run, succeeded, or is still `pending`/`failed` for a given report. Depending on `development_plan_gaps` would make the team view's completeness hostage to per-employee AI-generation timing; querying `assessment_scores`/`competencies` directly avoids that entirely.
- **Ranking method, confirmed with the user**: rank competencies by the **count of distinct direct reports** for whom that competency is a gap (descending) — not by summed or averaged gap size. Ties are broken alphabetically by competency name (`localeCompare`). The full ranked list is shown (no top-N cutoff) — at this pilot scale (≤6 competencies per seed data) a cutoff would hide, not clarify, the team picture.
- **Each ranked entry names the affected reports.** The leader already sees each report's scores individually via `/reviews`; naming them here is not a new level of data exposure, and it is what makes the ranking actionable (who to talk to).

## Desired End State

- When a Competence Leader logs in and visits `/dashboard`, they see a read-only list of every competency that is a gap for at least one direct report's **approved** assessment, ranked by how many reports have that gap (descending, ties alphabetical), each row naming the competency, the count, and the affected reports' names — plus a link to `/reviews`.
- If the leader has no direct reports at all, they see a "no direct reports" message instead.
- If the leader has direct reports but none has an approved assessment yet, they see a distinct "no approved assessments yet" message.
- If every direct report's approved assessment meets or exceeds every competency (zero gaps team-wide), they see a distinct "team meets or exceeds expectations" message.
- Employees and Admins see `/dashboard` exactly as it renders today — unchanged.

## What We're NOT Doing

- Not adding pagination, filtering, or sorting controls to the ranking — the full list is shown flat (per the confirmed scope decision); this pilot's competency/team sizes don't warrant it.
- Not showing the leader's own personal gaps (as an Employee) on this page — that data already lives at `/assessment`, and mixing it in here would blur this slice's scope.
- Not building S-05 (employee post-login redirect to `/assessment`) — separate roadmap slice, tracked independently.
- Not adding a dedicated `/team` URL — the team view renders directly at `/dashboard` for the `competence_leader` role, per the confirmed page-structure decision.
- Not persisting or caching the computed ranking — it's computed fresh on every `/dashboard` load, consistent with every other page in this app (no caching layer exists anywhere).
- Not exposing this data via a new API route — it's a server-rendered read in the Astro frontmatter, same pattern as `assessment.astro`/`reviews.astro`; no client-side interactivity is needed.

## Implementation Approach

Phase 1 extracts the aggregation into a small, pure, independently-reasoned-about function (`computeTeamGapRanking`) that takes flat per-report-per-competency score data and returns the ranked, grouped result — mirroring how S-03 extracted `generateDevelopmentPlanActions` into its own module. Phase 2 wires that function into `dashboard.astro`'s new role branch: fetch direct reports, fetch their approved assessments' scores and the relevant competencies, call the function, and render the three empty states or the ranked list.

## Critical Implementation Details

### Competency lookup must span every direct report's competency model, not just one

Each `assessments` row is tied to the `competency_model_id` in effect when that employee created it (per S-01's versioning decision). Although only one competency model has ever been active in this pilot, the competencies query must fetch by the **union** of `competency_model_id` values across all of the leader's reports' approved assessments (`.in("competency_model_id", uniqueModelIds)`), not by a single assessment's model — fetching against only one model would silently drop gaps for any report whose assessment referenced a different (e.g., since-superseded) model.

## Phase 1: Team gap aggregation logic

### Overview

A pure function that turns per-report, per-competency score data into the ranked team gap list, independently reasoned about before it's wired into any page.

### Changes Required:

#### 1. Aggregation function

**File**: `src/lib/team-gaps.ts`

**Intent**: One place that knows how to turn raw scores into the ranked "most common gaps" list, so `dashboard.astro` only has to fetch data and render.

**Contract**: Export `interface TeamGapRankingEntry { competency: Competency; count: number; employees: { id: string; full_name: string | null }[] }` and `function computeTeamGapRanking(scores: { employee: { id: string; full_name: string | null }; competency: Competency; score: number }[]): TeamGapRankingEntry[]`. Filters `scores` to entries where `score < competency.expected_proficiency_level`; groups the remainder by `competency.id`; each group's `count` is the number of distinct employees in it and `employees` lists them. Sorts the result descending by `count`, ties broken by `competency.name.localeCompare(other.name)` ascending. Returns `[]` when no entry qualifies as a gap (the zero-gap case) — the caller (Phase 2) is responsible for turning that into the "team meets expectations" message.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro check` passes (0 errors)
- `npm run build` passes

---

## Phase 2: Dashboard role branch

### Overview

Branch `/dashboard` by role: a Competence Leader gets the fetched-and-aggregated team gap view (or one of three empty states); every other role keeps today's unchanged generic welcome.

### Changes Required:

#### 1. Dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Make `/dashboard` the Competence Leader's team-gap landing page, without changing it for anyone else.

**Contract**: When `profile.role === "competence_leader"`:
1. Count direct reports: `select("id", { count: "exact", head: true }).eq("manager_id", user.id)` against `profiles`. Zero → render the "no direct reports" empty state and stop.
2. Fetch direct reports' **approved** assessments, joined with the employee profile (mirrors `reviews.astro`'s `employee:profiles!assessments_employee_id_fkey!inner(*)` pattern): `.eq("status", "approved").eq("employee.manager_id", user.id)`. Zero rows → render the "no approved assessments yet" empty state and stop.
3. Fetch `assessment_scores` (`competency_id`, `score`) for those assessment ids via `.in("assessment_id", ...)`, and `competencies` via `.in("competency_model_id", <unique model ids from step 2's assessments>)` (per Critical Implementation Details).
4. Build the flat `{ employee, competency, score }[]` input (joining scores → assessment → employee, and competency_id → competency) and call `computeTeamGapRanking`.
5. Empty result array → render the "team meets or exceeds expectations" empty state.
6. Non-empty → render the ranked list (competency name, count, comma-joined affected report names) using the shadcn `Table` components, plus a link to `/reviews`.

For every other role, render exactly the existing markup — no behavior change.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro check` passes (0 errors)
- `npm run build` passes

#### Manual Verification:

- As Junior Leader (2 direct reports, Alice and Bob, per seed data), with at least one of them having an approved assessment with real gaps, confirm `/dashboard` shows the correct ranking, counts, tie-break order, and affected-report names, plus a working link to `/reviews`
- Temporarily reassign a profile's `manager_id` in Supabase Studio to create a leader with zero direct reports; confirm that leader's `/dashboard` shows the "no direct reports" message
- With a leader whose reports exist but have no approved assessment (e.g., Alice still `draft`/`submitted`), confirm `/dashboard` shows the "no approved assessments yet" message, distinct from the zero-gap message
- Temporarily bump all of one report's scores to meet/exceed every competency (Studio SQL, as done for S-03's zero-gap test) and confirm — once that's the only report with an approved assessment for that leader, or all reports are at/above expectations — `/dashboard` shows the "team meets or exceeds expectations" message
- As Employee and as Admin, confirm `/dashboard` renders exactly as it did before this change (generic welcome, unaffected)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None planned — no test runner is configured in this project yet, consistent with F-01/S-01/S-02/S-03. `computeTeamGapRanking`'s pure-function shape keeps it easy to add a unit test for later if a runner is introduced.

### Integration Tests:

- Not in scope — no API route is introduced by this change.

### Manual Testing Steps:

1. `npm run build`, confirm no errors.
2. As Junior Leader, confirm the ranked team gap view renders correctly with real seed data.
3. Exercise all three empty states via temporary Studio data tweaks (zero reports, zero approved, zero gaps).
4. Confirm Employee/Admin dashboards are unaffected.

## Performance Considerations

Trivial data volumes at this pilot's scale (`target_scale: users: small` per `tech-stack.md`) — no pagination, indexing, or caching considerations apply.

## Migration Notes

None — no schema changes. Purely additive read-side logic on top of S-01/S-02's existing tables and RLS.

## References

- Roadmap: `context/foundation/roadmap.md` (S-04, milestone M-2)
- PRD: `context/foundation/prd.md` (Access Control matrix row "View team-level competency gaps/coverage" — not backed by its own FR, hence M-2's description-sourced charter, `MS-01`)
- Prior implementation: `context/archive/2026-09-14-ai-development-plan/plan.md` (S-03 — the per-employee gap-computation formula and the "extract pure logic into its own module" pattern this plan reuses)
- Prior implementation: `context/archive/2026-09-13-leader-review-and-approval/plan.md` (S-02 — the `employee:profiles!...!inner(*)` direct-reports query pattern and the RLS this plan depends on without changing)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Team gap aggregation logic

#### Automated

- [x] 1.1 `npm run lint` passes — 989d12a
- [x] 1.2 `npx astro check` passes (0 errors) — 989d12a
- [x] 1.3 `npm run build` passes — 989d12a

### Phase 2: Dashboard role branch

#### Automated

- [x] 2.1 `npm run lint` passes — a344e91
- [x] 2.2 `npx astro check` passes (0 errors) — a344e91
- [x] 2.3 `npm run build` passes — a344e91

#### Manual

- [x] 2.4 Junior Leader's `/dashboard` shows correct ranking, counts, tie-break order, affected-report names, and a working link to `/reviews` — a344e91
- [x] 2.5 A leader with zero direct reports sees the "no direct reports" message — a344e91
- [x] 2.6 A leader with reports but no approved assessments sees the "no approved assessments yet" message — a344e91
- [x] 2.7 A leader whose team meets/exceeds every competency sees the "team meets or exceeds expectations" message — a344e91
- [x] 2.8 Employee and Admin dashboards are unaffected — a344e91
