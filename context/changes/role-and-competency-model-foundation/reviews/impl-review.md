<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Role & Competency Model Foundation

- **Plan**: context/changes/role-and-competency-model-foundation/plan.md
- **Scope**: Phase 1-4 of 4 (full plan review — all phases marked complete)
- **Date**: 2026-09-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — `astro check` fails on `src/middleware.ts`'s profile query, contradicting Phase 2's own success criterion

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/middleware.ts:17-23
- **Detail**: `npx astro check` reports 1 real compile error: `.select("*").eq(...).maybeSingle().overrideTypes<Profile, { merge: false }>()` produces `Profile | { Error: "Type mismatch: Cannot cast array result to a single object..." } | null`, which isn't assignable to `context.locals.profile: Profile | null`. Verified live: reproduces with and without `{ merge: false }`; the equivalent `.insert().select().single().overrideTypes<T, {merge:false}>()` pattern used in the admin routes does *not* error, so this is specific to the `maybeSingle()` + non-array-override combination. `npm run lint` and `npm run build` (as literally run) don't surface it — build's esbuild step doesn't type-check, and this project has no wired-in `astro check`/`tsc` gate — so Phase 2's checked-off criterion "`npx astro sync && npm run build` passes (type-checks `App.Locals` extension)" is true only in the narrow build-doesn't-fail sense, not in the type-soundness sense the parenthetical claims.
- **Fix**: Replace `.maybeSingle().overrideTypes<Profile, { merge: false }>()` with `.maybeSingle<Profile>()`. Verified: `npx astro check` goes from 1 error to 0 errors with this change, no other behavior changes.
- **Decision**: FIXED — applied `.maybeSingle<Profile>()`; `npx astro check` confirms 0 errors.

### F2 — Competency-model activation is two non-atomic writes; a mid-flight failure can leave zero active models

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/admin/competency-models/index.ts:53-61 (POST), src/pages/api/admin/competency-models/[id].ts:36-45 (PATCH)
- **Detail**: Both handlers deactivate the currently-active row in one `UPDATE`, then activate the target in a second, separate `UPDATE`. If the first succeeds and the second fails (timeout, concurrent delete of the target, transient DB error), the system is left with zero active competency models — a state nothing else in the app currently checks for or recovers from. The partial unique index (Phase 1) only prevents *two* actives at once; it does not prevent *zero*. The same deactivate-then-activate logic is duplicated across both files, which is how the gap was introduced in two places instead of one.
- **Fix A ⭐ Recommended**: Collapse both statements into one atomic `update competency_models set is_active = (id = $1)` (or the query-builder equivalent) so activation is a single round trip that can't partially fail.
  - Strength: Removes the zero-active-model window entirely and eliminates the duplicated logic between POST and PATCH in the same change.
  - Tradeoff: Slightly less idiomatic than the current chained Supabase-JS calls; may need a small raw `.update()` expression or a `security definer` SQL helper if the query builder can't express `(id = $1)` as a settable value directly.
  - Confidence: HIGH — single-flag-flip is a standard pattern for "exactly one active row."
  - Blind spot: Haven't confirmed the Supabase-JS query builder syntax for a computed boolean update inline vs. needing a small RPC function.
- **Fix B**: Wrap deactivate+activate in a Postgres RPC function (`activate_competency_model(target_id uuid)`, `security definer`) called via `supabase.rpc()`, so both statements run in one DB-side transaction.
  - Strength: Keeps the two logical steps explicit and auditable; still a single network round trip from the app.
  - Tradeoff: Adds a new migration and RPC surface for something that's fundamentally a one-column flip.
  - Confidence: MEDIUM — correct, but more machinery than the problem needs.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — added `supabase/migrations/20260913140000_activate_competency_model_function.sql` (a `security definer` function doing a single `update ... set is_active = (id = target_id)` across the table, admin-gated internally via `is_admin()`), wired into POST and PATCH via `supabase.rpc("activate_competency_model", ...)`. Verified against a live `supabase db reset`: the flip is atomic (v1→inactive, v2→active in one statement), a call with no auth context raises `forbidden`, and a call from a non-admin profile also raises `forbidden`. Along the way, the pre-existing `.single().overrideTypes<T, {merge:false}>()` chain in this same POST handler tripped the same lint issue as F1 once `data.id`/`data.is_active` were touched directly — fixed identically (`.single<CompetencyModel>()`).

### F3 — DELETE on a competency model doesn't guard against removing the active one

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/admin/competency-models/[id].ts (DELETE handler), src/components/admin/CompetencyModelRowActions.tsx:31-44
- **Detail**: The DELETE route has no check for `is_active = true` on the target row. The UI's delete confirmation warns only that competencies will cascade-delete, not that this may be the active model. Deleting the active model (FK `on delete cascade` removes its competencies too) leaves the system with no active model at all, silently breaking the "exactly one active model" invariant the rest of this feature depends on.
- **Fix**: In the DELETE handler, reject with 400 when the target's `is_active` is true ("cannot delete the active model — activate a replacement first"); optionally also disable the Delete action in `CompetencyModelRowActions.tsx` for the row currently marked Active.
- **Decision**: FIXED — DELETE now selects `is_active` first and returns 400 with a clear message if true; `CompetencyModelRowActions.tsx`'s Delete button is disabled (with a title tooltip) on the active row. `npm run lint` and `npx astro check` both pass.

### F4 — Admin list pages silently swallow Supabase query errors

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/admin/profiles.astro:9-16, src/pages/admin/competency-models.astro:14-33
- **Detail**: All three server-side queries in these pages destructure only `data` (`const { data } = await supabase.from(...)...; profiles = data ?? [];`), never `error`. If a query fails (RLS denial, transient DB error), the page renders a silently empty table — indistinguishable from "no data" — inconsistent with the new API routes in this same change, which all check and surface `error`.
- **Fix**: Destructure `error` alongside `data` in each query and render a visible error state (or at least a server log) instead of defaulting straight to `[]`.
- **Decision**: FIXED — both pages now capture each query's `error` and render a visible `loadError` banner above the page content instead of silently falling back to `[]`. `npm run lint` and `npx astro check` both pass.

### F5 — `manager_id` reassignment has no cycle check

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/admin/profiles/[id].ts:14-21, src/components/admin/RoleManagerEditor.tsx:65-76
- **Detail**: The manager dropdown offers every profile including the row's own id, and neither the client nor the PATCH route rejects a resulting cycle (e.g., A→manager B, then later B→manager A). Nothing currently walks the manager chain recursively, so this is latent rather than exploitable today — but it's a landmine for leader-hierarchy features later on the roadmap (S-02 and beyond).
- **Fix**: Add a bounded walk-up check in the PATCH route (follow `manager_id` a few hops from the proposed value, reject if it reaches the target's own id) before a future phase starts relying on the hierarchy being acyclic. Safe to defer — flagging for visibility, not urgency.
- **Decision**: FIXED — added a bounded (50-hop) ancestor walk in the PATCH route; self-reassignment (the documented hierarchy-root convention) is exempted, any other chain that loops back to the target's own id is rejected with 400. Manually traced against the live seeded hierarchy (Alice→Junior Leader→Senior Leader→self) for both a rejected 2-cycle and an allowed re-parenting; `npm run lint` and `npx astro check` both pass. Note: the Supabase query for each hop had to be extracted into a small typed helper function (`fetchManagerLink`) — inlining it directly in the loop body tripped a real `ts(7022)` "implicitly has type any... referenced in its own initializer" circular-inference error against this project's untyped Supabase client, the same underlying class of issue as F1.

### F6 — Unused shadcn primitive `card.tsx` added but never wired in

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/ui/card.tsx
- **Detail**: `npx shadcn@latest add table input select label` (Phase 4, item 1) also pulled in `card.tsx` and `badge.tsx`. `badge.tsx` is used (`CompetencyModelRowActions.tsx` status pills) — justified. `card.tsx` has zero imports anywhere under `src`; it's dead code from the same `shadcn add` invocation.
- **Fix**: Delete `src/components/ui/card.tsx`, or wire it into a screen if one was actually intended to use it.
- **Decision**: FIXED — deleted the unused file; `npm run lint` still passes.

### F7 — Inconsistent empty-`description` handling between create and edit competency forms

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/admin/CompetencyRowEditor.tsx:29, src/components/admin/CreateCompetencyForm.tsx:29
- **Detail**: `CreateCompetencyForm` sends `description: description || undefined` when the field is blank; `CompetencyRowEditor`'s save always sends the raw (possibly `""`) value. Both pass zod validation (`description` is `z.string().optional()`), but a cleared description is persisted as `""` via edit and as absent/`null`-ish via create — a harmless but avoidable inconsistency between the two code paths for the same field.
- **Fix**: Normalize `description` the same way in `CompetencyRowEditor.tsx` before building the PATCH body.
- **Decision**: FIXED — `CompetencyRowEditor.tsx` now sends `description: description || undefined`, matching `CreateCompetencyForm.tsx`. `npm run lint` passes.

### F8 — Unplanned `astro.config.mjs` Vite change (justified, but undocumented in the plan)

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: astro.config.mjs:15-33
- **Detail**: Phase 4's commit adds a `vite.optimizeDeps.include` pin (react, radix-ui, lucide-react, etc.) not mentioned anywhere in the plan. The inline comment and commit message explain a real dev-server bug: without eager pre-bundling, Vite's on-disk dep cache can go stale across restarts and React islands (shadcn's Select, `useFormStatus`) throw or render blank during `astro dev`. This is a narrowly-scoped, transparently-documented fix that's a direct, reasonable consequence of shipping Phase 4's React islands — not scope creep — but it's exactly the kind of gotcha likely to recur on future phases that add new client-side islands.
- **Fix**: No code change needed. Recommend capturing this as a recurring rule via `/10x-lesson` ("React-island phases may need `vite.optimizeDeps.include` pinning to avoid dev-server dep-cache staleness") so future phases don't rediscover it from scratch.
- **Decision**: ACCEPTED-AS-RULE: "React islands can crash/blank during astro dev's SSR pass" (recorded in `context/foundation/lessons.md`, combined with F9 since both share the same root cause). No code change — lesson only.

### F9 — `profiles.astro` uses `client:only="react"` instead of `client:load` for its island

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/admin/profiles.astro:24-29
- **Detail**: A documented comment explains `client:only="react"` was needed to avoid a dev-only SSR crash in shadcn's Select component; the plan's Progress log (4.3) claims this was manually verified working. This is a reasonable, explicitly-called-out deviation rather than silent drift, but it means `profiles.astro`'s island hydrates differently than the plan's generic "React island per editable row/form" description implied, and differently from how `competency-models.astro`'s islands hydrate.
- **Fix**: No code change required if production behavior was already verified (per Progress 4.3-4.5). Recommend a one-line note in `lessons.md` alongside F8 so future admin islands don't default to `client:load` and rediscover the same SSR crash.
- **Decision**: ACCEPTED-AS-RULE: "React islands can crash/blank during astro dev's SSR pass" (recorded in `context/foundation/lessons.md`, combined with F8). No code change — lesson only.

## Non-findings confirmed clean

- All Phase 1 schema/RLS/seed contract items (enum, tables, partial unique index, `security definer` trigger, standalone `is_admin()` helper avoiding policy recursion, per-table/per-operation RLS) match the plan exactly.
- All 5 admin API route files: every one of 12 handlers (GET/POST/PATCH/DELETE across profiles/competency-models/competencies) is admin-gated, exports `prerender = false`, zod-validates input, and handles a null Supabase client.
- No SQL injection surface — all DB access goes through the Supabase query builder.
- `zod` correctly added to `dependencies` (not `devDependencies`).
- `src/middleware.ts` and `src/env.d.ts` correctly extend the existing null-tolerant pattern for `profile`, mirroring `user`.
- `seed.sql` contains only synthetic test emails and a dev-only placeholder password — no real credentials/PII.
- `npm run lint` passes cleanly (verified).
- `npm run build`'s actual compile/bundle step succeeds; the only failure observed locally is an environmental Windows file-lock (`EPERM`/`device or resource busy` on `dist/client`) during the build's cleanup step, unrelated to this change's code.

## References

- Sub-agent reviews: plan-drift detection and safety/quality/pattern compliance, run in parallel over all 4 phases' changed files.
- Verification commands run: `npm run lint` (pass), `npx astro sync` (pass), `npm run build` (compile succeeds; cleanup step blocked by an unrelated local file lock), `npx astro check` (1 error found and fix-verified, see F1).
