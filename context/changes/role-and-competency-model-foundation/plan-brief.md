# Role & Competency Model Foundation — Plan Brief

> Full plan: `context/changes/role-and-competency-model-foundation/plan.md`

## What & Why

Roadmap item F-01: give every account a role (Employee / Competence Leader / Admin), a leader→report relationship, and a versioned competency model — the data foundation that S-01 (self-assessment) and S-02 (leader review) both depend on. Also ships a minimal admin panel to manage that data.

## Starting Point

No Supabase migrations exist yet. Auth (`src/middleware.ts`) resolves only the raw Supabase user — no role, no manager relationship, no `src/types.ts`. Self-service signup already exists and is untouched by this plan.

## Desired End State

Every user has a `profiles` row (role + manager_id, self-referencing for hierarchy roots). One active, versioned competency model exists with its competencies. RLS lets a user see their own profile, a leader see their reports, and an admin see/manage everything. `/admin` is gated to the Admin role, which gets a UI to reassign profiles' role/manager and fully manage competency models + competencies.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Role storage | `profiles` table (FK to `auth.users`) | Standard Supabase pattern, clean RLS via `auth.uid()` | Plan |
| Leader→report | Self-referencing `manager_id` on `profiles` | PRD implies one direct leader per person; simplest query shape | Plan |
| Competency versioning | `competency_models` table + FK from `competencies` | PRD requires assessments to bind to "the model version in effect" — a real version entity makes that a single FK | Plan |
| Seeding | `supabase/seed.sql` | Standard Supabase convention, separate from schema migration | Plan |
| RLS shape | Granular per-role now (not read-all-authenticated) | User chose to model the real access boundary immediately rather than defer | Plan |
| Admin role + full CRUD panel | Added a 3rd role (Admin) with full CRUD for competency data | User explicitly approved this as a scope expansion beyond the PRD's 2-role, pre-provisioned model | Plan |
| Profile CRUD scope | Admin can only Read + Update profiles, not Create/Delete | Profile lifecycle is tied to `auth.users`, which this foundation slice doesn't manage | Plan |
| `manager_id` nullability | `NOT NULL`, self-reference for hierarchy roots | User chose to require it; self-reference satisfies the constraint without inventing a fictitious external leader | Plan |

## Scope

**In scope:** roles enum + `profiles`, `manager_id` hierarchy, versioned competency model, RLS (incl. `is_admin()` helper), auto-profile trigger, pilot seed data, `/admin` route gating, admin CRUD API (zod-validated) + UI for profiles (update-only) and competency models/competencies (full CRUD).

**Out of scope:** self-assessment/review/plan-generation logic (S-01/S-02/S-03), reworking existing signup flow, Create/Delete for profiles, automated RLS integration tests, multiple competency models per employee.

## Architecture / Approach

Postgres/Supabase schema (`profiles`, `competency_models`, `competencies`) with RLS as the real access-control boundary; Astro middleware surfaces role/manager per request and does route-level gating as a fast-fail UX layer on top of RLS; zod-validated Astro API routes back a small React/Astro admin UI.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. DB schema, RLS, seed | Tables, roles, RLS, `is_admin()`, pilot data | Seeding `auth.users` directly needs correct bcrypt hashing or GoTrue rejects it |
| 2. Types & middleware | `locals.profile`, `/admin` gating | `App.Locals` type extension must type-check cleanly |
| 3. Admin API | zod-validated CRUD routes | RLS is the real boundary — route-level admin check is UX only, must not be mistaken for the security layer |
| 4. Admin UI | Profile + competency-model/competency management screens | First screens beyond `button.tsx` — needs a few more shadcn components |

**Prerequisites:** none (first migration in the project).
**Estimated effort:** ~3-4 sessions across 4 phases, within the project's 1-week MVP budget.

## Open Risks & Assumptions

- **PRD deviation, not yet reconciled**: PRD Access Control defines only 2 roles and "pre-provisioned, not self-registration." This plan adds Admin + a CRUD panel by explicit user decision during planning. Recommend a follow-up PRD update so the document matches the system.
- Proficiency scale assumed to be an integer 1-5 (PRD doesn't specify a scale) — revisit if S-01's self-assessment UI needs something different.
- No automated RLS tests — role-boundary correctness is verified manually per phase.

## Success Criteria (Summary)

- Every seeded pilot user has a role and resolves through `manager_id` to a hierarchy root.
- A leader can only see their own reports' profiles; an employee only their own; an admin sees everything — verified by signing in as each.
- Admin can manage the competency model end-to-end through the UI without touching SQL.
