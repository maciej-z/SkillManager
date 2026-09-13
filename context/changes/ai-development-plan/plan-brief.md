# AI Development Plan — Plan Brief

> Full plan: `context/changes/ai-development-plan/plan.md`

## What & Why

Let an Employee (and their Competence Leader) view an AI-generated development plan once the leader approves an assessment: identified competency gaps ranked largest to smallest, with the top 3 paired with concrete recommended actions. This is the roadmap's north star (S-03) — the PRD's Secondary Success Criterion (leaders find the plan genuinely useful, not generic) rides entirely on this slice.

## Starting Point

S-02 shipped approved assessments with employee scores, both RLS-scoped to the employee and their direct manager. No AI provider integration exists anywhere in this codebase yet — this plan makes that choice for the first time. `infrastructure.md` already flags a real constraint for this exact feature: Cloudflare Workers has no background-job primitive and bills CPU-ms, so a slow LLM call can't safely block a request.

## Desired End State

Once a leader approves an assessment, a plan generates without ever blocking that approval. Both the employee's `/assessment` page and the leader's `/reviews/[id]` page show the same ranked gap list with top-3 recommended actions, a "generating" state while pending, and a clear error + retry if generation fails.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| AI provider | OpenRouter, plain `fetch` (no SDK) | Sidesteps the `nodejs_compat` bundling risk `infrastructure.md` already flagged for a new LLM SDK on Workers. |
| Generation trigger | Decoupled: eager on approve + view-time fallback | Matches infra's own guidance to keep in-Worker LLM latency out of the approve request's CPU-ms budget. |
| Recommended actions shape | Structured JSON, 2-3 bullet actions per gap | Matches Business Logic's literal "one or more concrete actions" wording — more scannable than prose. |
| Failure handling | Fail visibly, retry via page reload / button | Simple pending/ready/failed state machine with no background-retry infra needed. |
| Prompt context | Full competency profile, not just the one gap | Directly targets the PRD's own "not generic boilerplate" worry. |
| Plan UI location | Extend existing approved views, no new route | Both surfaces already render an approved read-only view (from S-02) — natural extension. |
| Tie-break at "top 3" cutoff | Stable order by competency creation order | Deterministic with zero new sorting logic invented. |
| Observability | Store raw LLM response alongside the parsed plan | Cheap now, lets the pilot's core hypothesis actually be evaluated later. |
| Dev/test cost | Env-gated stub when `OPENROUTER_API_KEY` unset | Mirrors the exact null-tolerant pattern already proven for optional Supabase config. |

## Scope

**In scope:**
- `development_plans`/`development_plan_gaps` schema + RLS (employee-or-manager, gated on `approved`)
- OpenRouter integration with an env-gated deterministic stub
- Gap computation (plain arithmetic) + the single idempotent, race-safe generate route
- Shared plan-view UI in both existing approved views + the eager approve-time trigger

**Out of scope:**
- A standalone `/plan` route
- Automatic background retries (no job queue on this platform)
- Regenerating an already-`ready` plan
- Team-level gap coverage/aggregation
- Real-time/polling UI for the pending state

## Architecture / Approach

Same three-phase shape as F-01/S-01/S-02: schema+RLS first, then the backend (AI client + gap math + one generate route, made race-safe via a `unique(assessment_id)` constraint and an insert-with-conflict-check as the very first write), then the UI — one shared `DevelopmentPlanView` component used by both the employee's and leader's existing approved-state views, plus a one-line fire-and-forget trigger added to the leader's approve action.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema & RLS | `development_plans`/`development_plan_gaps` tables, employee-or-manager RLS gated on `approved` | Getting the RLS join shape wrong breaks visibility for one of the two roles |
| 2. AI integration & generate route | OpenRouter client + stub, gap computation, the one generate route | The race-safety insert-then-check pattern is the only concurrency guard on a platform with no locks — getting it wrong risks a duplicate/wasted LLM call |
| 3. Plan UI | Shared plan-view component in both approved views + eager trigger | The eager trigger must genuinely never block/fail the approve action itself |

**Prerequisites:** S-02 (done) — a real approved assessment with employee scores must already exist.
**Estimated effort:** 3 phases, the largest scope of the three roadmap slices so far given the new external dependency.

## Open Risks & Assumptions

- No test runner exists for automated testing of the AI call — verification leans on the env-gated stub plus one manual pass against the real API.
- OpenRouter's specific response shape/reliability for structured JSON output hasn't been exercised yet in this codebase; Phase 2's manual verification is the first real test of that assumption.
- The eager-trigger + view-time-fallback design assumes "good enough" latency for a pilot-scale audience — no explicit SLA on how fast a plan becomes ready.

## Success Criteria (Summary)

- Approving an assessment reliably results in a plan (ready, or a clearly-recoverable failed state) visible to both the employee and the leader, without ever slowing down the approve action itself.
- A plan's recommended actions are grounded in the employee's actual gaps, not generic advice — directly testable by reading the raw stored response against the computed gaps.
- `npx supabase db reset`, `npm run lint`, `npx astro check`, and `npm run build` all pass after every phase.
