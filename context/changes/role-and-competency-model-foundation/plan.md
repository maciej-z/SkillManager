# Role & Competency Model Foundation Implementation Plan

## Overview

Lay the data and access-control foundation the rest of the SkillManager roadmap depends on: a `role` on every account (Employee / Competence Leader / Admin), a leader→report relationship, a versioned competency model, and a minimal admin panel to manage that data. This is roadmap item **F-01**, unlocking S-01 (self-assessment) and S-02 (leader review).

## Current State Analysis

- No Supabase migrations exist yet (`supabase/migrations/` is absent) — this is the first schema in the project.
- `src/middleware.ts` resolves only the raw Supabase Auth `user` (email/id) into `context.locals.user`. There is no concept of role, no leader/report relationship, and no `src/types.ts` yet.
- `src/pages/api/auth/{signin,signup,signout}.ts` already implement self-service signup/signin/signout as native form POSTs — this pre-dates F-01 and is out of scope to change here.
- `zod` is not yet a dependency, despite being CLAUDE.md's stated convention for API route validation.
- shadcn/ui is scaffolded ("new-york" style) but only `button.tsx` exists under `src/components/ui/`.

## Desired End State

- Every `auth.users` row has a corresponding `public.profiles` row with a `role` (`employee` | `competence_leader` | `admin`) and a non-null `manager_id` (self-referencing for hierarchy roots).
- A versioned competency model exists: `competency_models` (one `is_active = true` at a time) containing `competencies` (name, description, expected proficiency 1–5).
- RLS enforces: a user sees their own profile, a leader sees their direct reports' profiles, an admin sees all; competency data is readable by any authenticated user and writable only by admins.
- `context.locals.profile` (role + manager_id) is available on every request; `/admin/**` redirects non-admins.
- An admin can, through the UI, update any profile's role/manager and fully manage competency models + competencies.
- Pilot data (a handful of auth users + profiles + one active competency model) is seeded via `supabase/seed.sql`, and `supabase db reset` applies migration + seed cleanly.

### Key Discoveries:

- `src/lib/supabase.ts:5-8` already returns `null` when Supabase env vars are unset — any new code that reads `context.locals.profile` must tolerate a `null` user the same way `middleware.ts` already does for `user`.
- Self-referencing FK (`profiles.manager_id → profiles.id`) is satisfiable in the same `INSERT` for hierarchy-root rows because Postgres checks the FK after the row exists — no deferred constraint needed.
- Supabase RLS policies that need to know "is the current user an admin" must go through a `SECURITY DEFINER` helper function rather than a plain subquery on `profiles` from within a `profiles` policy, to avoid recursive policy evaluation.

## What We're NOT Doing

- Not changing the existing self-service signup flow (`src/pages/api/auth/signup.ts`) — auto-provisioning a `profiles` row on signup is in scope, but reworking signup itself is not.
- Not building Create/Delete for `profiles` in the admin panel — a profile's lifecycle is tied to its `auth.users` row (Supabase Auth), which this foundation slice doesn't manage. Admin can only Read profiles and Update `role`/`manager_id`. Full CRUD is scoped to `competency_models`/`competencies` only, which have no auth entanglement.
- Not building assessment, review, or plan-generation logic — that's S-01/S-02/S-03.
- Not supporting multiple competency models per employee (per-role variants) — PRD Non-Goals already excludes this; one active model at a time.
- Not adding automated RLS integration tests (would require test-user infra not yet in the project) — verification here is migration/seed apply + manual role-based check in Supabase Studio/browser.

## Implementation Approach

Ship the schema and RLS first (Phase 1) so the data model is locked before anything depends on it. Then surface role/manager on every request (Phase 2), so route guarding works before building the admin API. Then the admin API (Phase 3, zod-validated per CLAUDE.md convention), then the admin UI consuming it (Phase 4). Each phase is independently verifiable via `supabase db reset` + `npm run lint`/`npm run build`.

## Critical Implementation Details

### Scope deviation from PRD — flagged, not silently absorbed

The PRD's `Access Control` section defines exactly two roles (Employee, Competence Leader) and states accounts are "pre-provisioned (not self-registration)". This plan adds a third role (**Admin**) and a full CRUD panel for competency data — a deliberate scope expansion agreed during planning, not derivable from the PRD. `context/foundation/prd.md`'s Access Control matrix and `context/foundation/roadmap.md`'s F-01 description do not mention Admin or an admin panel. Recommend updating the PRD's Access Control section in a follow-up change once this lands, so the document matches the system. Until then, treat this plan as the source of truth for the Admin role's existence.

### RLS recursion avoidance

`profiles` SELECT policy must not run a plain `SELECT role FROM profiles WHERE id = auth.uid()` subquery inside a policy defined *on* `profiles` — that re-triggers the same policy recursively. Use a `SECURITY DEFINER STABLE` SQL function `public.is_admin()` that reads `profiles.role` bypassing RLS internally, and reference `public.is_admin()` in the policy instead. The "leader sees reports" branch of the policy (`manager_id = auth.uid()`) needs no such function — it's a direct column comparison, not a role lookup.

### Lint strictness on new query code

`eslint.config.js` extends `strictTypeChecked` + `stylisticTypeChecked` — `no-explicit-any`, `no-non-null-assertion`, and `no-unnecessary-condition` are all errors. Every phase's `npm run lint` gate will fail on untyped Supabase query results or `!` assertions against `profiles`/`competency_models`/`competencies` rows. Type every query result against the `src/types.ts` interfaces from Phase 2 rather than asserting or leaving them `any`.

### Auth-seed gotcha

Seeding `auth.users` directly via SQL (required for pilot accounts to exist before `profiles` can reference them) needs a real bcrypt-hashed password via `extensions.crypt(password, extensions.gen_salt('bf'))` and `email_confirmed_at` set, or Supabase's GoTrue will reject/ignore the row on login. Do this only in `supabase/seed.sql` (local/dev), never in a migration that could run against a shared environment.

## Phase 1: Database schema, RLS, and seed data

### Overview

Introduce `user_role` enum, `profiles`, `competency_models`, `competencies`, the auto-profile trigger, RLS policies, and pilot seed data.

### Changes Required:

#### 1. Schema migration

**File**: `supabase/migrations/20260913120000_role_and_competency_model_foundation.sql`

**Intent**: Establish the role/leader/competency-model schema described in Desired End State.

**Contract**:
- `create type public.user_role as enum ('employee', 'competence_leader', 'admin');`
- `public.profiles(id uuid primary key references auth.users(id) on delete cascade, role user_role not null default 'employee', manager_id uuid not null references public.profiles(id), full_name text, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`
- `public.competency_models(id uuid primary key default gen_random_uuid(), version integer not null, is_active boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now())` with a partial unique index enforcing at most one `is_active = true` row.
- `public.competencies(id uuid primary key default gen_random_uuid(), competency_model_id uuid not null references public.competency_models(id) on delete cascade, name text not null, description text, expected_proficiency_level smallint not null check (expected_proficiency_level between 1 and 5), created_at timestamptz not null default now())`
- Trigger `on_auth_user_created` (`after insert on auth.users`) creates a matching `profiles` row with `role = 'employee'`, `manager_id = NEW.id` (self, until an admin reassigns it). The trigger's underlying function must be declared `security definer` with `set search_path = public` — real signups insert into `auth.users` as `supabase_auth_admin`, which lacks INSERT on `public.profiles` by default; without `security definer` every future signup fails (an `after insert` trigger error rolls back the triggering statement).
- `public.is_admin()` — `security definer stable` SQL function returning whether `auth.uid()`'s profile has `role = 'admin'`.
- RLS enabled on all three tables. `profiles`: SELECT where `id = auth.uid() OR manager_id = auth.uid() OR public.is_admin()`; UPDATE where `public.is_admin()` (role/manager_id only — no client updates otherwise). `competency_models`/`competencies`: SELECT for any authenticated user; INSERT/UPDATE/DELETE where `public.is_admin()`.

#### 2. Pilot seed data

**File**: `supabase/seed.sql`

**Intent**: Provide a small pilot hierarchy (an admin, 1-2 competence leaders, a few employees reporting to them) and one active competency model with 5-8 competencies, so every later phase has real data to develop and verify against.

**Contract**: Start with `create extension if not exists pgcrypto with schema extensions;` (required for `crypt()`/`gen_salt()` below — not guaranteed enabled by default). Insert `auth.users` rows (via `extensions.crypt()` per the Auth-seed gotcha above) for each pilot account. The `on_auth_user_created` trigger (Phase 1 item 1) auto-creates a `profiles` row for each of these the moment the `auth.users` insert happens, so the seed's own `profiles` statement must be an upsert — not a plain insert — to set the real `role` and `manager_id` (top-of-hierarchy rows self-reference) without colliding on the primary key: `insert into public.profiles (id, role, manager_id, full_name) values (...) on conflict (id) do update set role = excluded.role, manager_id = excluded.manager_id, full_name = excluded.full_name;`. Then insert one `competency_models` row with `is_active = true`, then its `competencies` rows.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies the migration and seed with exit code 0
- `npm run lint` passes
- A follow-up `psql`/`supabase db execute` row-count check confirms expected counts (profiles, competency_models, competencies) — run inline, no new script needed

#### Manual Verification:

- Open Supabase Studio locally, confirm `profiles.manager_id` chains resolve to a self-referencing root, and exactly one `competency_models` row has `is_active = true`
- Sign in as a seeded employee and a seeded leader (via existing `/auth/signin`) and confirm each can only query their own/their reports' profile rows (spot-check via Supabase client in browser console or a temporary log)
- Complete a brand-new signup through the existing `/auth/signup` flow and confirm it still succeeds and a `profiles` row now exists for that user (validates the trigger's `security definer` privilege didn't regress the existing signup path)

---

## Phase 2: Shared types and middleware role exposure

### Overview

Give the rest of the app typed access to role/manager data, and gate `/admin` for non-admins.

### Changes Required:

#### 1. Shared types

**File**: `src/types.ts`

**Intent**: Central types for `UserRole`, `Profile`, `CompetencyModel`, `Competency` so DB rows have one canonical shape across API routes, middleware, and UI.

**Contract**: Export a `UserRole` union (`"employee" | "competence_leader" | "admin"`) and interfaces mirroring the Phase 1 tables' columns.

#### 2. Middleware

**File**: `src/middleware.ts`

**Intent**: Resolve the current user's `profiles` row alongside `user`, and protect `/admin` for non-admins.

**Contract**: After resolving `user`, if present, query `profiles` by `id` and attach as `context.locals.profile: Profile | null` (mirrors the existing null-tolerant pattern for `user`). Add `/admin` to a role-gated route check: unauthenticated → redirect `/auth/signin` (existing behavior); authenticated but `profile.role !== "admin"` → redirect `/dashboard`.

**File**: `src/env.d.ts` (or wherever `App.Locals` is declared — locate via existing `locals.user` typing)

**Intent**: Extend the `Astro.Locals` type with `profile`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run build` passes (type-checks `App.Locals` extension)
- `npm run lint` passes

#### Manual Verification:

- Sign in as a seeded non-admin, navigate to `/admin`, confirm redirect to `/dashboard`
- Sign in as the seeded admin, navigate to `/admin`, confirm access

---

## Phase 3: Admin API routes

### Overview

zod-validated API routes for the admin panel: update a profile's role/manager, and full CRUD for competency models + competencies.

### Changes Required:

#### 1. Add zod dependency

**File**: `package.json`

**Intent**: CLAUDE.md's stated convention is zod validation on API routes; it's not yet installed.

**Contract**: Add `zod` to `dependencies`.

#### 2. Profile update route

**File**: `src/pages/api/admin/profiles/[id].ts`

**Intent**: Let an admin change a target profile's `role` and/or `manager_id`.

**Contract**: `export const prerender = false;` `PATCH` handler, admin-gated via `context.locals.profile?.role === "admin"` (403 otherwise), zod schema validating `{ role?: UserRole; manager_id?: string (uuid) }`, updates via the Supabase server client (RLS `is_admin()` policy is the actual enforcement boundary; the route-level check is a fast-fail UX layer).

#### 3. Competency model CRUD routes

**Files**: `src/pages/api/admin/competency-models/index.ts` (GET list, POST create), `src/pages/api/admin/competency-models/[id].ts` (PATCH, DELETE)

**Intent**: Admin manages competency model versions; creating/activating one deactivates any previously active model (enforced at the application layer, backstopped by Phase 1's partial unique index).

**Contract**: zod schema for `{ version: number; is_active: boolean }`. POST/PATCH that sets `is_active: true` first clears the current active row in the same request.

#### 4. Competencies CRUD routes

**Files**: `src/pages/api/admin/competencies/index.ts` (GET list by `competency_model_id`, POST create), `src/pages/api/admin/competencies/[id].ts` (PATCH, DELETE)

**Intent**: Admin manages the competencies within a model.

**Contract**: zod schema for `{ competency_model_id: string; name: string; description?: string; expected_proficiency_level: number (1-5) }`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes (typecheck across new routes)

#### Manual Verification:

- As admin, hit each route with a REST client (or the Phase 4 UI once built) and confirm expected success/validation-error responses
- As a non-admin, confirm each route returns 403/redirect rather than performing the mutation

---

## Phase 4: Admin UI

### Overview

Minimal authenticated screens for the admin to manage profiles and the competency model.

### Changes Required:

#### 1. shadcn components

**Intent**: Add the form/table primitives the admin screens need.

**Contract**: `npx shadcn@latest add table input select label` (or whichever subset the built screens end up using).

#### 2. Admin pages

**Files**: `src/pages/admin/index.astro` (nav/landing), `src/pages/admin/profiles.astro`, `src/pages/admin/competency-models.astro`

**Intent**: `profiles.astro` lists all profiles with role/manager editable inline (React island calling the Phase 3 PATCH route); `competency-models.astro` lists models, supports creating a new version, toggling active, and managing its competencies (create/edit/delete).

**Contract**: Server-rendered list (Astro, direct Supabase query) + a React island per editable row/form for the mutation calls, following the existing pattern of native form posts where practical and `fetch` to the JSON API routes where inline edits need it.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- As admin: reassign a seeded employee's manager via `/admin/profiles`, confirm the change persists and the employee's leader view (query) reflects it
- As admin: create a new competency model version, activate it, add/edit/delete a competency, confirm only one model is ever active
- As non-admin: confirm `/admin/*` pages are unreachable (redirect from Phase 2)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None planned — no test runner is configured in this project yet; verification relies on lint/build/migration-apply plus manual checks, consistent with the project's current tooling.

### Integration Tests:

- Not in scope (see What We're NOT Doing — RLS integration tests deferred).

### Manual Testing Steps:

1. `npx supabase db reset` locally, confirm no errors.
2. Sign in as each seeded role (employee, competence leader, admin) and confirm `/admin` gating behaves per role.
3. As admin, walk through profile reassignment and full competency-model/competency CRUD in the UI.
4. As a leader, spot-check (via browser devtools Supabase client call or temporary debug log) that only reports' profiles are visible, not the whole org.

## Performance Considerations

None specific — pilot-scale data (a handful of users, one active model with under a dozen competencies).

## Migration Notes

This is the first migration in the project; no existing data to migrate. `supabase/seed.sql` is idempotent-unsafe by default (plain inserts) — re-running `supabase db reset` is the supported reset path, not re-running seed against a populated DB.

## References

- Roadmap: `context/foundation/roadmap.md` (F-01)
- PRD: `context/foundation/prd.md` (FR-001, FR-002, Access Control — see Critical Implementation Details for the documented deviation)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database schema, RLS, and seed data

#### Automated

- [x] 1.1 `npx supabase db reset` applies migration and seed with exit code 0 — ba0d2da
- [x] 1.2 `npm run lint` passes — ba0d2da
- [x] 1.3 Row-count check confirms expected seed data — ba0d2da

#### Manual

- [x] 1.4 Supabase Studio: manager_id chains resolve, exactly one active competency_model — ba0d2da
- [x] 1.5 Sign in as seeded employee/leader, confirm profile visibility scoping — ba0d2da
- [x] 1.6 New signup via `/auth/signup` succeeds and creates a profiles row — ba0d2da

### Phase 2: Shared types and middleware role exposure

#### Automated

- [x] 2.1 `npx astro sync && npm run build` passes
- [x] 2.2 `npm run lint` passes

#### Manual

- [x] 2.3 Non-admin redirected from `/admin` to `/dashboard`
- [x] 2.4 Admin can access `/admin`

### Phase 3: Admin API routes

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npm run build` passes

#### Manual

- [ ] 3.3 Admin requests succeed with expected responses across all routes
- [ ] 3.4 Non-admin requests are rejected (403/redirect) across all routes

### Phase 4: Admin UI

#### Automated

- [ ] 4.1 `npm run lint` passes
- [ ] 4.2 `npm run build` passes

#### Manual

- [ ] 4.3 Admin reassigns a profile's manager via UI, change persists
- [ ] 4.4 Admin creates/activates a competency model version and manages its competencies via UI
- [ ] 4.5 Non-admin cannot reach `/admin/*` pages
