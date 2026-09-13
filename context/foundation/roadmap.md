---
project: "SkillManager"
version: 1
status: draft
created: 2026-09-13
updated: 2026-09-13
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: first-ai-development-plan
milestone_seq: 1
milestone_status: open
---

# Roadmap: SkillManager

> Derived from context/foundation/prd.md (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: First AI development plan** — Status: open

- **Intent:** Prove the full assessment-to-plan pipeline works end-to-end for one employee/leader pair — self-assessment, leader approval, gap identification, and a genuinely useful AI-generated development plan.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`.

## Vision recap

Employees and their Competence Leaders currently have no structured way to assess skills, spot the competency gaps that matter, and turn them into a real development plan — it happens today via spreadsheets, informal chats, or not at all. This PoC replaces that with a structured self-assessment that a leader reviews and approves, followed by an AI-generated, personalized multi-month development plan built from the employee's actual approved gaps — data trustworthy enough for real staffing and development decisions, not a generic training catalog.

## North star

**S-03: Employee (and leader) receive the AI-generated development plan** — this is the slice that actually tests the PoC's core bet: that leader-approved, gap-specific AI plans are more useful than a generic catalog. Everything before it only matters if this works.

> "North star" here means the smallest end-to-end slice that, if it works, proves the product's core idea — sequenced as early as its prerequisites allow, because the rest of the roadmap only pays off if this one does.

## At a glance

| ID   | Change ID                          | Outcome (user can …)                                                        | Prerequisites | PRD refs                                        | Status   |
| ---- | ----------------------------------- | ---------------------------------------------------------------------------- | -------------- | ------------------------------------------------ | -------- |
| F-01 | role-and-competency-model-foundation | (foundation) roles, leader→report links, and the competency model are in place | —              | FR-001, FR-002, Access Control                    | done |
| S-01 | employee-self-assessment             | view the competency model and complete + submit a self-assessment            | F-01           | FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007 | planning |
| S-02 | leader-review-and-approval           | (as leader) review a report's submitted assessment and approve or return it  | S-01, F-01     | FR-008, FR-009, FR-010, FR-011, FR-012            | proposed |
| S-03 | ai-development-plan                  | see the AI-generated development plan built from approved gaps               | S-02           | FR-013, FR-014, FR-015, FR-016, FR-017, US-01      | proposed |

## Baseline

What's already in place in the codebase as of `2026-09-13` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19 islands, Tailwind 4, shadcn/ui "new-york" components scaffolded (`src/layouts/Layout.astro`, `src/components/ui/button.tsx`). No domain UI yet.
- **Backend / API:** partial — Astro SSR API routes exist only for auth (`src/pages/api/auth/{signin,signup,signout}.ts`). No competency/assessment/review/plan endpoints yet.
- **Data:** absent — Supabase client wired (`src/lib/supabase.ts`) and CLI present (`supabase/config.toml`), but no migrations exist — no competency-model, assessment, or plan schema.
- **Auth:** present but role-less — full sign-in/up/out + session middleware gating `/dashboard` (`src/middleware.ts`), but no Employee/Competence Leader role field and no leader→report relationship data yet.
- **Deploy / infra:** present — Cloudflare adapter + wrangler configured, GitHub Actions CI (`.github/workflows/ci.yml`) runs lint+build, already deployed once per git history.
- **Observability:** absent — no logging/error-tracking/metrics libraries found.

## Foundations

### F-01: Role & competency-model foundation

- **Outcome:** (foundation) user accounts carry an Employee/Competence Leader role plus a leader→report assignment; the competency model (competencies with name, description, and expected proficiency level) is defined and seeded for the pilot group.
- **Change ID:** role-and-competency-model-foundation
- **PRD refs:** FR-001, FR-002, Access Control section, Non-Functional Requirements (visibility guardrail)
- **Unlocks:** S-01 (needs a role + an applicable competency model to view), S-02 (needs the leader→report relationship to know who a leader can review)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced first because every downstream slice needs to know who's an Employee vs. a Competence Leader and which competency model applies to them; skipping this would force S-01 to invent throwaway role logic that S-02 would then have to rework.
- **Status:** done

## Slices

### S-01: Employee completes and submits a self-assessment

- **Outcome:** user can view the competency model applicable to them, score every competency (with an optional comment), save progress as a draft, and submit a completed assessment for review.
- **Change ID:** employee-self-assessment
- **PRD refs:** FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Nothing downstream can happen until a real submitted assessment exists, so this has to land before review/approval logic. Scope is deliberately kept to "create, score, draft, submit one assessment" — no review logic here.
- **Status:** planning

### S-02: Competence Leader reviews and approves an assessment

- **Outcome:** user (Competence Leader) can see assessments submitted by their direct reports, review the scores, add their own comments, and approve the assessment or return it for correction.
- **Change ID:** leader-review-and-approval
- **PRD refs:** FR-008, FR-009, FR-010, FR-011, FR-012
- **Prerequisites:** S-01, F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Depends on a real submitted assessment (S-01) and the leader→report relationship (F-01). Approval is the guardrail the PRD calls non-bypassable — it has to land before any plan-generation logic can be trusted to consume "approved" data.
- **Status:** proposed

### S-03: Employee (and leader) receive the AI-generated development plan

- **Outcome:** user (Employee) can view a personalized development plan — the system's identified competency gaps, ranked largest to smallest, with the top 3 each paired with concrete recommended actions — generated immediately after their Competence Leader approves the assessment; the Competence Leader can view the same plan for their report.
- **Change ID:** ai-development-plan
- **PRD refs:** FR-013, FR-014, FR-015, FR-016, FR-017, US-01
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the north star: the PoC's Secondary Success Criterion (leaders find the plan genuinely useful, not generic) rides entirely on this slice. Sequenced last since F-01 → S-01 → S-02 all exist purely to produce the approved-gap data this slice consumes.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                          | Suggested issue title                                          | Ready for `/10x-plan` | Notes |
| ---------- | ------------------------------------ | ---------------------------------------------------------------- | ---------------------- | ----- |
| F-01       | role-and-competency-model-foundation | Add Employee/Competence Leader roles + seed the competency model | yes                    | —     |
| S-01       | employee-self-assessment             | Employee self-assessment: view model, score, draft, submit       | yes                    | — |
| S-02       | leader-review-and-approval           | Competence Leader review & approval of a submitted assessment    | no                     | Blocked on S-01, F-01 |
| S-03       | ai-development-plan                  | AI-generated development plan from approved gaps                 | no                     | Blocked on S-02 |

## Open Roadmap Questions

1. **The PRD's Secondary Success Criterion and the Access Control matrix both imply Competence Leaders should see team-level competency gap coverage across all their reports (not just one submission at a time), but no Functional Requirement specifies building that aggregated view.** Should this become a roadmap slice for this milestone, and if so, what aggregation is expected? — Owner: user. Block: roadmap-wide (no existing slice is blocked by it; resolving it in-scope would add a new slice after S-03).

## Parked

- **Multiple/role-specific competency models** — Why parked: PRD Non-Goals limits MVP to a single competency model per employee (already flagged in FR-001's Socrates note).
- **Custom recommendation/scoring algorithm built from scratch** — Why parked: PRD Non-Goals leans on an existing AI capability rather than a bespoke engine; specific choice is a downstream tech-stack decision.
- **Employee feedback/rating on the generated plan** — Why parked: PRD Non-Goals keeps the plan view-only for MVP.
- **Org-wide rollout or self-service account creation** — Why parked: PRD Non-Goals locks MVP to a pre-provisioned pilot group.
- **Full WCAG-AA accessibility compliance** — Why parked: PRD Non-Goals excludes this for the small, known pilot group.

## Milestone History

(none yet — this is the first milestone)

## Done

- **F-01: (foundation) user accounts carry an Employee/Competence Leader role plus a leader→report assignment; the competency model (competencies with name, description, and expected proficiency level) is defined and seeded for the pilot group.** — Archived 2026-09-13 → `context/archive/2026-09-13-role-and-competency-model-foundation/`. Lesson: —.
