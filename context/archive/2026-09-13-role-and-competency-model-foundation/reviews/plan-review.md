<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Role & Competency Model Foundation

- **Plan**: context/changes/role-and-competency-model-foundation/plan.md
- **Mode**: Deep
- **Date**: 2026-09-13
- **Verdict**: SOUND (after fixes; REVISE at time of review)
- **Findings**: 2 critical, 2 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | FAIL (pre-fix) |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL (pre-fix) |
| Plan Completeness | WARNING (pre-fix) |

## Grounding

Grounding: 5/5 paths ✓ (src/middleware.ts, src/lib/supabase.ts, src/pages/api/auth/signup.ts, package.json, components.json), 3/3 symbols ✓ (App.Locals in src/env.d.ts, zod absent from package.json, Postgres major_version 17 in supabase/config.toml), brief↔plan ✓

Sub-agent verification (blast radius + patterns + lint strictness): no other file references `locals.user` besides `src/middleware.ts`; no naming collision on `profile`/`Profile`; no existing admin/CRUD pattern in the repo to reuse; `supabase/migrations/` and all `*.sql` in the repo are genuinely empty (no pre-existing trigger conflicts); `eslint.config.js` extends `strictTypeChecked` + `stylisticTypeChecked`; zod confirmed absent; no new env vars needed.

## Findings

### F1 — Seed script will PK-conflict with the auto-profile trigger

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 1 — Pilot seed data
- **Detail**: The `on_auth_user_created` trigger auto-creates a `profiles` row for every new `auth.users` row, including the pilot accounts `seed.sql` inserts directly into `auth.users`. `seed.sql`'s own plain `INSERT` into `profiles` for those same ids then collides on the primary key. As written, `npx supabase db reset` — Phase 1's own Automated Verification item 1.1 — would fail.
- **Fix**: Changed `seed.sql`'s profiles insert to an upsert (`INSERT ... ON CONFLICT (id) DO UPDATE SET role = excluded.role, manager_id = excluded.manager_id, full_name = excluded.full_name`) so it overwrites the trigger's auto-created row instead of colliding with it.
- **Decision**: FIXED (Fix in plan)

### F2 — Trigger function's privilege level is unspecified, risking the existing self-service signup flow

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Schema migration
- **Detail**: Real signups via `/auth/signup` insert into `auth.users` under `supabase_auth_admin`, which lacks INSERT on `public.profiles` by default. Without `SECURITY DEFINER` on the trigger function, every future signup would fail (an AFTER INSERT trigger error rolls back the triggering statement) — and no phase's manual verification exercised an actual *new* signup end-to-end, only sign-in with pre-seeded accounts.
- **Fix**: Trigger function contract now requires `security definer` with `set search_path = public` (Supabase's documented pattern). Added a manual verification step (Phase 1, Progress 1.6): complete a brand-new signup through `/auth/signup` and confirm it succeeds and a profile is created.
  - Strength: Matches Supabase's own documented pattern; closes the only untested path that could regress an existing, working feature.
  - Tradeoff: None real — this is the standard, correct way to write this trigger.
  - Confidence: HIGH — well-known, specifically-documented Supabase gotcha.
  - Blind spot: Haven't verified this project's exact `supabase_auth_admin` grants locally — `SECURITY DEFINER` is correct regardless.
- **Decision**: FIXED (Fix in plan)

### F3 — pgcrypto extension never explicitly enabled

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Pilot seed data
- **Detail**: `seed.sql` depends on `extensions.crypt()`/`gen_salt()` to hash pilot passwords, but nothing ensures the `pgcrypto` extension is enabled.
- **Fix**: Added `create extension if not exists pgcrypto with schema extensions;` at the top of the `seed.sql` contract.
- **Decision**: FIXED (Fix in plan)

### F4 — Plan doesn't account for `strictTypeChecked` ESLint config

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Phases 2–4
- **Detail**: `eslint.config.js` extends `strictTypeChecked` + `stylisticTypeChecked` (`no-explicit-any`, `no-non-null-assertion`, `no-unnecessary-condition` as errors). Every phase lists `npm run lint` as a gate, but the plan never flagged that untyped Supabase query results would trip it.
- **Fix**: Added a "Lint strictness on new query code" note to Critical Implementation Details.
- **Decision**: FIXED (Fix in plan)
