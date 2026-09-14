# Employee Self-Assessment — Plan Brief

> Full plan: `context/changes/employee-self-assessment/plan.md`

## What & Why

Let an Employee view the active competency model and complete a self-assessment: score every competency (1–5, with an optional comment), save progress as a draft, and submit once complete. This is the first user-facing slice on the roadmap (S-01) — it produces the real submitted data that S-02 (leader review) and S-03 (the AI-generated development plan) both depend on.

## Starting Point

F-01 already shipped roles, the leader→report hierarchy, and the versioned competency model + its admin panel. No assessment schema, API, or employee-facing page exists yet — `dashboard.astro` is still a placeholder stub, and `/assessment` isn't a route.

## Desired End State

An Employee visiting `/assessment` sees exactly the right thing for their state: a message if no competency model is active, a "start assessment" action if they haven't begun, a live scoring form if they have a draft in progress, or a locked read-only view once they've submitted. Submission is permanent — enforced at the database (RLS) level, not just in the UI.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Optional score comment (FR-005) | Included now | Trivially cheap alongside the score column; adds texture beyond a bare number. |
| Post-submit lifecycle | Locked/read-only, enforced by RLS | Matches the PRD's approval-gate mental model — a "submitted" assessment has to mean something trustworthy before S-02/S-03 can consume it. |
| Assessment identity | One per (employee, competency-model version), unique constraint | Matches FR-003's versioning resolution; keeps "my current assessment" an unambiguous lookup. |
| Score storage | Normalized `assessment_scores` table | S-03's gap ranking needs a per-competency join — a JSON blob would push that complexity downstream. |
| Draft-save UX | Explicit "Save Draft" button | Matches every existing form in this codebase (no autosave pattern anywhere yet). |
| Score input control | Radio button group | All 5 options visible, one click each — faster to fill out than a dropdown for 6+ competencies. New shadcn primitive, not yet installed. |
| Submit guardrail | Inline "N of M scored" + disabled Submit | Employee can never attempt an invalid submit; no wasted round trip or confusing error. |
| No-active-model empty state | Plain "nothing active yet" message, no form | Matches the codebase's existing null-tolerant pattern (missing config → banner, not a crash). |

## Scope

**In scope:**
- `assessments` + `assessment_scores` schema and RLS (owner-only, locked after submit)
- Create / save-scores / submit API routes
- `/assessment` page covering all four states, radio-group scoring form
- Seed data exercising all three assessment states (none/draft/submitted)

**Out of scope:**
- Leader review/approval (S-02)
- Gap identification and AI plan generation (S-03)
- Un-submitting or editing after submit
- Retrofitting existing admin routes to a shared UUID validator (new routes only)
- Automated RLS integration tests (manual verification, same as F-01)

## Architecture / Approach

Three phases, same shape as F-01: schema+RLS first (so the locking behavior is proven before anything depends on it), then the three mutation API routes (create, save-scores, submit — each admin-route-style: `prerender = false`, zod-validated, ownership-checked, RLS-backstopped), then the employee-facing page + a single `AssessmentForm` React island. The post-submit lock is enforced twice — once in the submit route's server-side completeness check, once in RLS's `USING (status = 'draft')` clause on the existing row — so no client-side bug can leave a submitted assessment writable.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema & RLS | `assessments`/`assessment_scores` tables, owner-only + locked-after-submit policies, updated seed data | Getting the RLS `USING` clause wrong would either block the submit transition itself or fail to lock afterward |
| 2. Types & API routes | Create, save-scores, submit endpoints | Server-side completeness check must match the disabled-button UX exactly, or Alice could get a confusing 400 |
| 3. Employee UI | `/assessment` page (4 states) + scoring form island | New radio-group primitive is radix-based — same SSR-crash risk class already documented in lessons.md for `Select` |

**Prerequisites:** F-01 (done) — role/profile data and the active competency model must already exist.
**Estimated effort:** 3 phases, similar scope to F-01's Phase 1+3 combined.

## Open Risks & Assumptions

- The radio-group shadcn primitive may hit the same dev-only Astro SSR crash already seen with `Select` — Phase 3 has a documented fallback (`client:only="react"`) and a verification step for it.
- No test-user infra exists for automated RLS tests, so the post-submit lock is verified manually (attempt a write as the submitted-seed employee) rather than in CI.

## Success Criteria (Summary)

- An employee can go from no-assessment → draft (partially scored) → fully scored → submitted, entirely through the UI.
- A submitted assessment cannot be altered by that employee again, through the UI or a direct API call.
- `npx supabase db reset`, `npm run lint`, `npx astro check`, and `npm run build` all pass after every phase.
