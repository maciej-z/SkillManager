# Leader Review and Approval — Plan Brief

> Full plan: `context/changes/leader-review-and-approval/plan.md`

## What & Why

Let a Competence Leader see the assessments their direct reports have submitted, review the employee's scores (view-only), add per-competency and overall review comments, and either approve or return the assessment for correction. This is the second slice on the roadmap (S-02) — approval is the non-bypassable guardrail S-03 (the AI-generated development plan) depends on.

## Starting Point

S-01 shipped the `assessments`/`assessment_scores` schema with a `draft → submitted` lock, but RLS scopes everything to the employee — a leader currently has zero visibility into a report's assessment. F-01 already established the `profiles.manager_id` leader→report relationship this plan extends into assessment visibility.

## Desired End State

A leader visiting `/reviews` sees a queue of their direct reports' submitted assessments; opening one shows the employee's scores read-only, lets the leader add comments, and offers Approve (terminal) or Return for Correction (back to the employee's existing draft flow).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Leader review depth | Per-competency comment only, employee's score untouched | Matches PRD Business Logic's literal wording — S-03 consumes "the employee's approved self-assessment scores," not a separate leader score. |
| Overall comment | One optional overall comment field, in addition to per-competency | Cheap (one column), gives the leader a place for holistic feedback. |
| Return-for-correction | Included in this slice | FR-011 (approve) and FR-012 (return) are two branches of the same decision — building only one leaves no way to send back a real problem. |
| Return status | Straight back to `'draft'`, no new enum value | Zero new employee-side UI — S-01's existing draft-editing screen already handles it. |
| Queue scope | Only `submitted` assessments (actionable) | Matches FR-008's literal scope — the queue is exactly the leader's to-do list. |
| Approval finality | Terminal, no unapprove | Same one-way-lock convention as S-01's submit, keeps RLS simple and consistent. |
| Queue → detail navigation | List page, click through to a detail page | Matches this codebase's existing list-then-detail pattern; stays legible with multiple pending reviews. |
| Route gating | No role gate — data-scoped by `manager_id` | The manager relationship, not the `role` label, is the actual review authority in this codebase's existing design. |

## Scope

**In scope:**
- `assessments`/`assessment_scores` schema additions (leader_comment, reviewed_by, reviewed_at) and leader-scoped RLS
- Approve and return-for-correction API routes
- `/reviews` queue page + `/reviews/[id]` detail page + review form

**Out of scope:**
- Gap identification and AI plan generation (S-03)
- Leader editing the employee's own score
- Un-approving an approved assessment
- A separate "save review progress" action (comments save together with the approve/return decision)
- Team-level competency gap coverage (explicitly unassigned in `roadmap.md`'s Open Roadmap Questions)

## Architecture / Approach

Same three-phase shape as S-01: schema+RLS first (reusing S-01's exact `USING (status = <locked-value>)` on-the-existing-row lock pattern, just gated on the leader's `manager_id` relationship instead of employee ownership), then two API routes (approve/return, each saving comments and flipping status in one call with the same false-positive-success defense fixed in S-01's impl-review), then the leader-facing UI. One real gotcha: Postgres won't let a transaction both add an enum value and reference it, so adding `'approved'` to the status enum is its own migration file, ahead of the RLS policies that compare against it.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema & RLS | `approved` status value (split migration), leader-review columns, leader-scoped RLS on both tables | Getting the enum-value split wrong breaks migration apply; getting the lock's `USING` clause wrong breaks the one-way transition |
| 2. Types & API routes | Approve and return-for-correction routes | RLS can't restrict which columns an UPDATE touches — the route itself must never let a leader's payload reach the employee's `score` field |
| 3. Leader UI | `/reviews` queue + detail page + review form | None significant — reuses only already-proven primitives, no new SSR-crash risk |

**Prerequisites:** S-01 (done) and F-01 (done) — a real submitted assessment and the leader→report relationship must already exist.
**Estimated effort:** 3 phases, similar scope to S-01.

## Open Risks & Assumptions

- No test-user infra exists for automated RLS tests, so the leader-review lock and manager-scoping are verified manually (attempt cross-manager access, attempt a second approve) rather than in CI, same as F-01/S-01.
- The column-level tampering guard (leader can't touch `score` via the comment-update route) is enforced entirely by the route's update payload shape, not by RLS — a future refactor that spreads the raw request body into the update call would silently reopen this gap.

## Success Criteria (Summary)

- A leader can see their direct reports' (and only their direct reports') submitted assessments, review them, and approve or return each one.
- Approval is permanent; return-for-correction hands the assessment back to the employee's existing S-01 flow with the leader's comments intact.
- `npx supabase db reset`, `npm run lint`, `npx astro check`, and `npm run build` all pass after every phase.
