# Leader Team Gap View — Plan Brief

> Full plan: `context/changes/leader-team-gap-view/plan.md`

## What & Why

Give a Competence Leader a read-only, post-login landing page ranking the most common competency gaps across their direct reports — extending the PoC's core bet ("leaders find this data genuinely useful") from a single approved assessment (S-03) to the team level. This is roadmap slice S-04, the north star of milestone M-2.

## Starting Point

`/dashboard` is today one generic "Welcome, {email}" page with no role branching. All the data this needs already exists and is already readable by a leader under S-01/S-02's RLS (`assessments_select_leader`, `assessment_scores_select_leader`) — no migration required. Gap computation itself is the same plain arithmetic S-03 already uses per-employee (`score < expected_proficiency_level`), just aggregated across reports instead of one assessment.

## Desired End State

A Competence Leader logs in, lands on `/dashboard`, and sees every competency that's a gap for at least one direct report, ranked by how many reports have it, each row naming the competency, the count, and who's affected — plus a link into `/reviews`. Three distinct empty states cover no-reports, no-approved-assessments-yet, and team-meets-expectations. Employees and Admins see the dashboard unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Ranking method | Frequency count (# reports with the gap) | Literally matches "najczęstsze" (most frequent) from the M-2 charter; simplest, most legible metric | Plan (interview) |
| Tie-break | Alphabetical by competency name | User's explicit pick over the avg-gap-size alternative | Plan (interview) |
| List scope | Full ranking, no top-N cutoff | Pilot scale (≤6 competencies) means a cutoff would hide, not clarify | Plan (interview) |
| Per-row detail | Count + affected report names | Leader already sees this per-report in `/reviews` — not a new exposure level, and it's what makes the ranking actionable | Plan (interview) |
| Data source | Recompute from `assessment_scores`/`competencies` directly, not `development_plan_gaps` | Keeps the team view independent of per-employee AI-generation timing/status | Plan (research) |
| Page structure | `/dashboard` branches by role directly | Matches "first page a leader sees after login"; no new protected route needed | Plan (interview) |
| Own gaps on this page | No — stays team-only, personal gaps stay at `/assessment` | Keeps this slice's scope exactly what M-2's charter described | Plan (interview) |

## Scope

**In scope:** role-branched `/dashboard` for Competence Leaders; team-wide gap ranking (frequency, alphabetical tie-break, full list, named reports); three empty states; link to `/reviews`.

**Out of scope:** S-05 (employee post-login redirect — separate slice); leader's own personal gaps on this page; pagination/filtering; a dedicated `/team` URL; any new API route or migration.

## Architecture / Approach

Phase 1 extracts a pure `computeTeamGapRanking` function (`src/lib/team-gaps.ts`) — mirrors how S-03 extracted its AI call into its own module. Phase 2 wires it into `dashboard.astro`'s new role branch: fetch direct reports → fetch their approved assessments' scores + relevant competencies (unioned across every referenced competency model) → call the function → render the ranking or the appropriate empty state.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Team gap aggregation logic | `computeTeamGapRanking` — pure, independently reasoned about | Getting the tie-break/grouping rule wrong before it's wired anywhere visible |
| 2. Dashboard role branch | The actual leader-facing `/dashboard` view + 3 empty states | Competency lookup must union every report's `competency_model_id`, not just one (see plan's Critical Implementation Details) |

**Prerequisites:** None — all data and RLS already exist (S-01/S-02).
**Estimated effort:** 2 phases, no schema changes, no new API route.

## Open Risks & Assumptions

- Assumes every direct report has at most one assessment per competency model at a time (true today — enforced by `assessments`' `unique(employee_id, competency_model_id)` — but the competency-model union logic in Phase 2 is there specifically so this still works if that ever changes).
- No automated tests (no test runner in this project yet, consistent with every prior slice) — verification is lint/typecheck/build plus manual passes against seed data.

## Success Criteria (Summary)

- A Competence Leader's `/dashboard` shows the correct ranking (count, tie-break, affected names) for real seed data, and a working link to `/reviews`.
- All three empty states render correctly and distinctly.
- Employee and Admin dashboards are provably unaffected.
