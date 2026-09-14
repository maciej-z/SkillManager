# Employee Post-Login Redirect Implementation Plan

## Overview

Send an Employee straight to `/assessment` immediately after signing in — and on every subsequent visit to `/dashboard` — instead of leaving them on the generic dashboard welcome. This is roadmap item **S-05**, the second (parallel) slice of milestone M-2, alongside S-04's leader team-gap view.

## Current State Analysis

- `src/pages/api/auth/signin.ts` (fixed during S-04) already redirects every successful login to `/dashboard`, unconditionally, for every role.
- `src/middleware.ts` already resolves `context.locals.profile` (including `role`) on every request — no extra query is needed to know the role inside `dashboard.astro`.
- `src/pages/dashboard.astro` (from S-04) already branches by role: `competence_leader` gets the team gap view; everyone else (`employee` and `admin`) falls into the generic "Welcome, {email}" cosmic-hero branch, unchanged since before S-04.
- `src/pages/assessment.astro` (from S-01) already renders every lifecycle state an employee could be in — no active competency model, draft, submitted, approved — nothing new needs to be built there.

### Key Discoveries:

- **Confirmed with the user**: the redirect fires on every `/dashboard` visit by an employee, not just immediately post-login — symmetric with how S-04 makes `/dashboard` itself the leader's permanent landing view, and avoids tracking a separate "just logged in" signal.
- **Confirmed with the user**: if `profile` is null (missing/edge case), skip the redirect and fall through to the existing generic dashboard render — matches how the rest of `dashboard.astro` already treats a null profile defensively.
- **Confirmed with the user**: the redirect is silent (a real HTTP redirect, no interstitial message) and fires unconditionally regardless of whether an active competency model exists — `/assessment` already renders the correct "no competency model is active yet" message for that state.

## Desired End State

- An Employee who signs in, or who navigates to `/dashboard` at any later point in their session, is immediately redirected to `/assessment` — they never see the generic dashboard welcome.
- Competence Leaders (S-04's team gap view) and Admins (unchanged generic welcome) are unaffected.

## What We're NOT Doing

- Not changing `signin.ts` — it already redirects everyone to `/dashboard`; this plan only changes what happens once an employee arrives there.
- Not adding any new page, route, or UI — `/assessment` already handles every state an employee could land in.
- Not showing an interstitial "redirecting..." message — the redirect is silent, per the confirmed UX decision.
- Not changing behavior for the Competence Leader or Admin roles.

## Implementation Approach

Add a single early guard clause at the top of `dashboard.astro`'s frontmatter — before S-04's team-gap query logic runs — that redirects an `employee`-role user to `/assessment` via `Astro.redirect`. No other file changes are needed.

## Phase 1: Employee redirect

### Overview

The one change this plan makes: an early-exit redirect in `dashboard.astro` for the employee role.

### Changes Required:

#### 1. Dashboard entry guard

**File**: `src/pages/dashboard.astro`

**Intent**: Send an Employee straight to their assessment instead of the generic dashboard, on every visit.

**Contract**: Immediately after resolving `user`/`profile` from `Astro.locals` (before computing `isLeader` or running any Supabase queries), add: if `profile?.role === "employee"`, `return Astro.redirect("/assessment")`. No change to the existing `isLeader` branch, the S-04 query logic, or the generic (now effectively admin-only) welcome branch.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro check` passes (0 errors)
- `npm run build` passes

#### Manual Verification:

- As Employee (Alice or Bob), sign in and confirm landing directly on `/assessment`, never seeing `/dashboard`'s content
- As a signed-in Employee, manually navigate to `/dashboard` mid-session and confirm the same redirect fires
- As Competence Leader, confirm `/dashboard` still shows the S-04 team gap view unaffected
- As Admin, confirm `/dashboard` still shows the generic welcome unaffected

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

## Testing Strategy

### Unit Tests:

- None planned — no test runner is configured in this project yet, consistent with every prior slice; this change is also too small (one guard clause) to warrant one even if a runner existed.

### Integration Tests:

- Not in scope — no API route is introduced or changed by this plan.

### Manual Testing Steps:

1. `npm run build`, confirm no errors.
2. Sign in as an Employee, confirm the redirect to `/assessment`.
3. Confirm Competence Leader and Admin dashboards are unaffected.

## Performance Considerations

None of note — a single conditional check runs before any other logic in the file.

## Migration Notes

None — no schema or data changes.

## References

- Roadmap: `context/foundation/roadmap.md` (S-05, milestone M-2)
- PRD: `context/foundation/prd.md` (M-2's description-sourced charter anchor `MS-02` — not backed by a numbered FR, same as S-04's `MS-01`)
- Prior implementation: `context/changes/leader-team-gap-view/plan.md` (S-04 — established the `profile.role`-based branching in `dashboard.astro` and fixed `signin.ts`'s redirect target to `/dashboard`, both of which this plan builds directly on)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Employee redirect

#### Automated

- [x] 1.1 `npm run lint` passes
- [x] 1.2 `npx astro check` passes (0 errors)
- [x] 1.3 `npm run build` passes

#### Manual

- [x] 1.4 As Employee (Alice or Bob), sign in and confirm landing directly on `/assessment`, never seeing `/dashboard`'s content
- [x] 1.5 As a signed-in Employee, manually navigate to `/dashboard` mid-session and confirm the same redirect fires
- [x] 1.6 As Competence Leader, confirm `/dashboard` still shows the S-04 team gap view unaffected
- [x] 1.7 As Admin, confirm `/dashboard` still shows the generic welcome unaffected
