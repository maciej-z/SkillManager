# Employee Post-Login Redirect — Plan Brief

> Full plan: `context/changes/employee-post-login-redirect/plan.md`

## What & Why

Send an Employee straight to `/assessment` after signing in — and on every later visit to `/dashboard` — instead of leaving them on the generic dashboard welcome. This is roadmap slice S-05, the parallel counterpart to S-04's leader team-gap view within milestone M-2.

## Starting Point

`signin.ts` already redirects every successful login to `/dashboard` (fixed during S-04). `dashboard.astro` already branches by role — Competence Leaders get S-04's team gap view; Employees and Admins currently fall into the same unchanged generic "Welcome, {email}" screen. `/assessment` (S-01) already handles every state an employee could be in.

## Desired End State

An Employee never sees the generic dashboard — signing in, or navigating to `/dashboard` at any point in their session, lands them directly on `/assessment`. Leaders and Admins are unaffected.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Redirect trigger | Every `/dashboard` visit, not just post-login | Symmetric with S-04's permanent leader landing page; no "just logged in" tracking needed | Plan (interview) |
| Missing profile | Fall through to generic dashboard, no error | Matches existing defensive null-profile handling elsewhere in the file | Plan (interview) |
| Redirect UX | Silent, no interstitial message | Matches the existing app's lack of any post-login messaging anywhere | Plan (interview) |
| No active competency model | Redirect anyway — `/assessment` already renders that state | Avoids duplicating messaging logic; one canonical landing point | Plan (interview) |
| Where the logic lives | `dashboard.astro`, not `signin.ts` | Reuses `profile` already loaded by middleware; no extra query; consistent with S-04's role-branch pattern | Plan (research) |

## Scope

**In scope:** one early-exit redirect guard in `dashboard.astro` for the `employee` role.

**Out of scope:** any change to `signin.ts`, any new page/route/UI, Leader or Admin dashboard behavior.

## Architecture / Approach

A single `if (profile?.role === "employee") return Astro.redirect("/assessment");` at the top of `dashboard.astro`'s frontmatter, before S-04's team-gap query logic runs.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Employee redirect | The guard clause itself | None significant — single conditional, no data/API changes |

**Prerequisites:** None — S-04 already put the role-branching and post-login redirect target in place.
**Estimated effort:** 1 phase, one file, one conditional.

## Open Risks & Assumptions

- None of note — this is the smallest possible slice given what S-04 already built.

## Success Criteria (Summary)

- Every Employee login lands on `/assessment`, never on the generic dashboard.
- Leader and Admin dashboard behavior is provably unchanged.
