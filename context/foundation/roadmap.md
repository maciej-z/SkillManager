---
project: "SkillManager"
version: 1
status: draft
created: 2026-09-13
updated: 2026-09-14
prd_version: 1
main_goal: speed
top_blocker: none
milestone_id: role-based-landing-pages
milestone_seq: 2
milestone_status: done
---

# Roadmap: SkillManager

> Derived from context/foundation/prd.md (v1) + a user-described milestone charter + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-2: Role-based landing pages & team gap visibility** — Status: done

- **Intent:** Give each role a landing experience suited to what they actually do first — a Competence Leader opens to a read-only ranked view of their team's most common competency gaps (extending the PoC's leader-usefulness bet from a single assessment to the team level), while an Employee is sent straight into their own assessment instead of a generic dashboard.
- **Source materials:** user description (anchors below). Traces conceptually to `context/foundation/prd.md`'s Access Control matrix row *"View team-level competency gaps/coverage"* (Competence Leader only), which M-1 left as an unresolved Open Roadmap Question since no Functional Requirement specified it.
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:**
  - MS-01: A Competence Leader's post-login landing page is a read-only view ranking the most common competency gaps across their direct reports; from it, the leader can navigate to the review queue (`/reviews`).
  - MS-02: An Employee is redirected straight to the assessment page immediately after login, instead of landing on the generic dashboard.

## Vision recap

Employees and their Competence Leaders currently have no structured way to assess skills, spot the competency gaps that matter, and turn them into a real development plan. M-1 shipped the full per-employee pipeline (self-assessment → leader approval → AI-generated plan). M-2 is the natural next step the PRD's own Access Control matrix implied but didn't specify: give the Competence Leader a team-level view of where gaps cluster, and get the Employee straight to the task they came to do.

## North star

**S-04: Competence Leader sees the team's most common competency gaps** — this is the slice that extends the PoC's core leader-usefulness bet (Secondary Success Criterion in the PRD) from "one approved assessment" to "my whole team, at a glance." It's the first thing a leader would look for once several reports have been assessed.

> "North star" here means the smallest end-to-end slice that, if it works, proves this milestone's core idea — sequenced as early as its prerequisites allow, because the rest of the milestone only pays off if this one does.

## At a glance

| ID   | Change ID                    | Outcome (user can …)                                                              | Prerequisites | PRD refs | Status |
| ---- | ----------------------------- | ---------------------------------------------------------------------------------- | -------------- | -------- | ------ |
| S-04 | leader-team-gap-view           | (as leader) see, immediately after login, a ranked view of the team's most common competency gaps, with a link into the review queue | —              | MS-01    | done |
| S-05 | employee-post-login-redirect   | (as employee) land directly on the assessment page after logging in                | —              | MS-02    | done |

## Baseline

What's already in place in the codebase as of `2026-09-14` (carried forward from M-1's implementation; re-confirmed by direct inspection, not re-probed since no layer changed shape).

- **Frontend:** present — Astro 6 + React 19 islands, Tailwind 4, shadcn/ui "new-york" components; full employee/leader domain UI now exists (self-assessment, review/approval, development-plan views).
- **Backend / API:** present — Astro SSR API routes for auth, admin (competencies/models), assessments, reviews, and AI plan generation.
- **Data:** present — full Postgres schema (`profiles`, `competency_models`, `competencies`, `assessments`, `assessment_scores`, `development_plans`, `development_plan_gaps`), RLS enabled on every table, employee-or-manager visibility already proven across S-01–S-03.
- **Auth:** present — full role-based auth (Employee / Competence Leader / Admin) with leader→report relationships; `context.locals.user`/`profile` already available in `src/middleware.ts`. `src/pages/dashboard.astro` is currently a single generic "Welcome, {email}" page with no role branching — this is exactly the gap both M-2 slices close.
- **Deploy / infra:** present — Cloudflare adapter + wrangler, GitHub Actions CI (lint + build).
- **Observability:** absent — no logging/error-tracking/metrics libraries found (unchanged since M-1).

No baseline layer is absent or partial in a way that blocks either slice — both build directly on data and auth that already exist. This milestone has no Foundations.

## Foundations

(None for M-2 — the Baseline above already covers everything both slices need: role data, approved-assessment data, and per-employee gap computation precedent from S-03. Neither slice's technical need justifies a cross-cutting enabler ahead of the vertical work itself.)

## Slices

### S-04: Competence Leader sees the team's most common competency gaps

- **Outcome:** user (Competence Leader) lands, immediately after login, on a read-only view ranking the most common competency gaps across their direct reports' approved assessments; from there they can navigate to the review queue (`/reviews`).
- **Change ID:** leader-team-gap-view
- **PRD refs:** MS-01
- **Prerequisites:** —  (consumes existing `assessments`/`assessment_scores`/`competencies` data — and optionally `development_plan_gaps` from S-03 — all already in place)
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:**
  - The exact aggregation method for "most common gaps" isn't specified (frequency count of reports with that gap vs. average/summed gap size vs. something else). — Owner: user. Block: no — a reasonable default (frequency count, ties broken by average gap size) can be proposed and confirmed at `/10x-plan` time without blocking sequencing.
- **Risk:** This is the milestone's north star — the team-level extension of the PRD's "leaders find this useful" bet. Sequenced first (alongside S-05, since neither depends on the other) because it's the validation slice for this milestone.
- **Status:** done

### S-05: Employee lands directly on the assessment page after login

- **Outcome:** user (Employee) is redirected straight to `/assessment` immediately after signing in, instead of seeing the generic dashboard.
- **Change ID:** employee-post-login-redirect
- **PRD refs:** MS-02
- **Prerequisites:** —
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Small, self-contained UX change with no data dependency; a good candidate to run in parallel with S-04 on a separate agent if capacity allows.
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID                  | Suggested issue title                                      | Ready for `/10x-plan` | Notes |
| ---------- | ---------------------------- | -------------------------------------------------------------- | ---------------------- | ----- |
| S-04       | leader-team-gap-view         | Leader landing page: team-wide competency gap ranking            | yes                    | —     |
| S-05       | employee-post-login-redirect | Employee post-login redirect straight to /assessment              | yes                    | —     |

## Open Roadmap Questions

(None currently — M-1's one open question, about team-level gap visibility, is what this milestone (M-2) was opened to resolve.)

## Parked

- **Multiple/role-specific competency models** — Why parked: PRD Non-Goals limits MVP to a single competency model per employee (already flagged in FR-001's Socrates note).
- **Custom recommendation/scoring algorithm built from scratch** — Why parked: PRD Non-Goals leans on an existing AI capability rather than a bespoke engine; specific choice is a downstream tech-stack decision.
- **Employee feedback/rating on the generated plan** — Why parked: PRD Non-Goals keeps the plan view-only for MVP.
- **Org-wide rollout or self-service account creation** — Why parked: PRD Non-Goals locks MVP to a pre-provisioned pilot group.
- **Full WCAG-AA accessibility compliance** — Why parked: PRD Non-Goals excludes this for the small, known pilot group.

## Milestone History

- **M-1: First AI development plan** (`first-ai-development-plan`) — closed 2026-09-14. Full assessment-to-plan pipeline shipped end-to-end: role/competency foundation, employee self-assessment, leader review and approval, and the AI-generated development plan (the north star).
- **M-2: Role-based landing pages & team gap visibility** (`role-based-landing-pages`) — closed 2026-09-14. A Competence Leader's `/dashboard` now shows a read-only ranking of the team's most common competency gaps (the north star); an Employee is redirected straight to `/assessment` after login.

## Done

- **F-01: (foundation) user accounts carry an Employee/Competence Leader role plus a leader→report assignment; the competency model (competencies with name, description, and expected proficiency level) is defined and seeded for the pilot group.** — Archived 2026-09-13 → `context/archive/2026-09-13-role-and-competency-model-foundation/`. Lesson: —.
- **S-01: user can view the competency model applicable to them, score every competency (with an optional comment), save progress as a draft, and submit a completed assessment for review.** — Archived 2026-09-14 → `context/archive/2026-09-13-employee-self-assessment/`. Lesson: —.
- **S-02: user (Competence Leader) can see assessments submitted by their direct reports, review the scores, add their own comments, and approve the assessment or return it for correction.** — Archived 2026-09-14 → `context/archive/2026-09-13-leader-review-and-approval/`. Lesson: —.
- **S-03: user (Employee) can view a personalized development plan — the system's identified competency gaps, ranked largest to smallest, with the top 3 each paired with concrete recommended actions — generated immediately after their Competence Leader approves the assessment; the Competence Leader can view the same plan for their report.** — Archived 2026-09-14 → `context/archive/2026-09-14-ai-development-plan/`. Lesson: —.
- **S-04: user (Competence Leader) lands, immediately after login, on a read-only view ranking the most common competency gaps across their direct reports' approved assessments; from there they can navigate to the review queue (`/reviews`).** — Archived 2026-09-14 → `context/archive/2026-09-14-leader-team-gap-view/`. Lesson: —.
- **S-05: user (Employee) is redirected straight to `/assessment` immediately after signing in, instead of seeing the generic dashboard.** — Archived 2026-09-14 → `context/archive/2026-09-14-employee-post-login-redirect/`. Lesson: —.
