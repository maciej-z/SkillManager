---
project: SkillManager
researched_at: 2026-09-12
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (SSR) + React 19 islands
  runtime: Cloudflare Workers
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project is already scaffolded for it — `wrangler.jsonc`, the `@astrojs/cloudflare` adapter, and `output: "server"` are all in place and working. It scored a clean 5/5 on the agent-friendly criteria (CLI-first via `wrangler`, fully managed isolate model, GA `llms.txt`/markdown docs, deterministic `wrangler deploy`, and a GA managed MCP server catalog), and the developer interview confirmed existing Cloudflare familiarity, no persistent-connection requirement, and no need for platform-co-located data services (Supabase stays external either way). The anti-bias cross-check surfaced two real risks — an open `@supabase/ssr` compatibility bug and CPU-ms-based billing — but for a one-week solo PoC with a small pilot group, staying on the already-working, already-familiar platform outweighs the cost of re-platforming to dodge risks that are mitigable in place.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP/Integration | Total |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| Railway | Pass | Pass | Pass | Pass | Pass | 5 Pass* |
| Vercel | Pass | Pass | Pass | Pass | Partial (beta) | 4 Pass / 1 Partial |
| Render | Pass | Pass | Pass | Pass | Partial (GA, gaps) | 4 Pass / 1 Partial |
| Netlify | Partial (rollback UI/API-only) | Pass | Pass | Pass | Pass | 4 Pass / 1 Partial |
| Fly.io | Partial (rollback = redeploy) | Pass (Dockerfile mandatory) | Partial (llms.txt unconfirmed) | Pass | Fail/Partial (experimental) | 2 Pass / 2 Partial / 1 Fail |

\*Railway matches the rubric score but multiple 2026 community reports (including a January 2026 incident report) describe recurring build/deploy instability, and realistic Hobby-tier usage often lands $20–40/mo rather than the advertised $5–20/mo band — a soft negative outside the rubric's five criteria.

Notes per platform:

- **Cloudflare Workers** — Astro's own docs now state the `@astrojs/cloudflare` adapter "no longer supports deployment on Cloudflare Pages"; Workers is the sole supported target, matching this project's existing config. `nodejs_compat` (GA) covers most of what `@supabase/ssr` and `astro:env` need, with one known open gap (see Risk Register). Free tier: 100k req/day; paid floor $5/mo covers 10M requests + 30M CPU-ms.
- **Vercel** — Official `@astrojs/vercel` adapter is GA and mature. Hobby tier (1M invocations/mo, 100GB transfer) comfortably covers a pilot-group PoC for free. MCP is public beta, not GA. Best runner-up if Workers-specific issues ever force a migration.
- **Render** — Official Astro SSR template exists; Node hosting is straightforward and avoids all edge-runtime compatibility questions entirely. Rollback and most operations are CLI/API-driven (Pass). MCP is GA but can't configure image-backed services or scaling. Free tier cold-starts (~1 min) and a 30-day-expiring free Postgres make the paid Starter tier ($7/mo) the realistic floor.
- **Netlify** — GA adapter and GA MCP server, but rollback is dashboard/API-driven rather than a dedicated CLI verb, and billing shifted to a credit-based model in 2025–2026 that's harder to predict than flat request/instance pricing.
- **Fly.io** — Best technical fit for genuinely persistent processes (not needed here per the interview), but requires a mandatory Dockerfile, has no confirmed canonical `llms.txt`, and its MCP integration (`flymcp`) is explicitly experimental with minimal maintenance activity.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Already deployed-to in this repo (`wrangler.jsonc`, `@astrojs/cloudflare`). Clean sweep on all five criteria: `wrangler` handles the full operational loop (deploy, rollback, tail, versions) without a dashboard; Cloudflare publishes GA `llms.txt`/markdown docs and a managed MCP server catalog. The interview's existing-familiarity answer reinforces the pick — no ramp-up cost.

#### 2. Vercel

Loses only on MCP maturity (public beta vs. GA elsewhere). Otherwise a fully GA, first-class Astro SSR target with the most generous free tier of the group and the best-documented adapter. The clean fallback if the Workers-specific `@supabase/ssr` bug or CPU-ms billing model becomes a real blocker.

#### 3. Render

Traditional always-on Node hosting sidesteps every edge-runtime compatibility question this stack currently carries (no `nodejs_compat` gaps, no CPU-ms metering, no Pages/Workers ambiguity). Costs more predictably ($7/mo Starter floor) and has an official Astro SSR template ready to go if a full re-platform is ever warranted.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Open, unresolved `@supabase/ssr` compatibility bug** — `createServerClient` (used in `src/lib/supabase.ts`) can throw `"dynamic require of 'stream' is not supported"` on certain code paths under Workers. It's an open GitHub issue (supabase/supabase#37592) with no fix timeline, and this project uses exactly that library/runtime combination.
2. **CPU-ms billing, not request/wall-clock billing** — Workers meter CPU time (10ms/invocation free, 30M CPU-ms bundled on the $5/mo paid plan). FR-015's AI-generated development-plan feature does synchronous work around an LLM call; any non-trivial templating, validation, or crypto stacked on that risks hitting CPU-ms ceilings in a way that doesn't map to intuitions built from request-count or instance-hour billing on other platforms.
3. **No background-job primitive** — Workers are a pure request/response isolate model. A slow LLM call for FR-015 blocks the request thread, with no built-in queue/worker abstraction to offload it if the call runs long.
4. **This project's own hand-off doc is already stale** — `tech-stack.md` records `deployment_target: cloudflare-pages`, but Astro's current adapter docs state Workers is the only supported target. A future agent trusting that hint file at face value would chase the wrong deploy path.
5. **`nodejs_compat` is broad but not full Node** — workerd doesn't support CommonJS; a transitive dependency pulled in later (e.g. an LLM SDK added for FR-015) can silently fail to bundle or throw only at deploy time, not during local `astro dev`.

### Pre-Mortem — How This Could Fail

The team deployed the SkillManager PoC on Cloudflare Workers. Six months later, it was quietly shelved. Three weeks in, adding the AI-generated development-plan feature (FR-015) required a new LLM SDK. It worked locally under `astro dev`, but production deploys threw opaque bundling errors — a transitive dependency assumed a Node-only API `nodejs_compat` doesn't cover. Two days were lost bisecting bundler output before finding a community thread describing the exact failure. Separately, a Competence Leader's review page occasionally 502'd, eventually traced to the open `@supabase/ssr` stream-require issue firing on a rarely-hit session-refresh path — no fix, only a hand-rolled cookie-parsing workaround. Meanwhile, CPU-ms billing meant a slow AI-generation request during a stakeholder demo silently throttled, and nobody had budgeted time to learn Workers' cost model deeply enough to see it coming. The "obvious, already-scaffolded" choice turned into ongoing platform-specific firefighting for what was meant to be a one-week PoC.

### Unknown Unknowns

- CPU-ms metering is a genuinely different cost model than every other shortlisted platform (request-count or instance-hour based) — cost estimates built "by analogy" to Vercel/Render/Railway pricing will be wrong for CPU-heavy work.
- `wrangler.jsonc`'s `compatibility_date` field silently gates which runtime behaviors are active — bumping it later (or not) can change already-working code with no compiler error.
- This repo's own `tech-stack.md` hint (`cloudflare-pages`) contradicts both the actual scaffold and current Astro docs (Workers-only) — a live discrepancy already sitting in the project's own foundation docs.
- Debugging a live Workers issue means `wrangler tail`, not an SSH-into-the-box or attached-debugger workflow — operational muscle memory from Node hosts (Render/Railway/Fly) doesn't transfer.
- `wrangler rollback` reverts code instantly, but not a concurrently-shipped Supabase schema migration — a "rollback" can leave code and DB schema mismatched if both shipped in the same release.

**Decision after cross-check**: proceed with Cloudflare Workers, risks recorded below — the platform is already working, and the surfaced risks are mitigable in place for a one-week PoC scope.

## Operational Story

- **Preview deploys**: `wrangler versions upload` publishes a new version with its own preview URL without routing production traffic to it; `wrangler versions deploy` promotes a specific version to production traffic once verified. No GitHub PR-preview wiring exists yet in `.github/workflows/ci.yml` — would need to be added if PR-level previews are wanted.
- **Secrets**: `SUPABASE_URL` / `SUPABASE_KEY` are pushed directly via `wrangler secret put <NAME>` into Cloudflare's Workers secret store (encrypted at rest, not visible in `wrangler.jsonc` or the dashboard after creation). CI currently only reads `SUPABASE_URL`/`SUPABASE_KEY` as GitHub Actions repository secrets for the **build** step (`.github/workflows/ci.yml`) — production runtime secrets and CI build secrets are two separate stores today.
- **Rollback**: `wrangler rollback [deployment-id]` reverts the live Worker to a prior deployment in seconds. Caveat from the cross-check: it does not revert a Supabase schema migration shipped in the same release — check migration state separately before assuming a rollback is complete.
- **Approval**: a human should gate `wrangler deploy`/`wrangler versions deploy` to production and any `wrangler secret put` that rotates `SUPABASE_KEY`. An agent may run read-only operations unattended: `wrangler tail` (live logs), `wrangler deployments list`, and `wrangler versions upload` (creates a preview, routes no production traffic).
- **Logs**: `wrangler tail` streams live request logs from the terminal. `wrangler.jsonc` already has `observability.enabled: true`, so structured logs and traces are also queryable in the Cloudflare dashboard's Observability view for historical (not just live-tail) lookups.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Open `@supabase/ssr` "dynamic require of stream" bug fires on an untested auth code path (session refresh, admin calls) | Devil's advocate | M | H | Exercise sign-in, sign-up, and session-refresh flows against a real `wrangler deploy` (not just `astro dev`) before pilot launch; monitor supabase/supabase#37592 for a fix |
| CPU-ms billing surprise on the AI-generated development-plan feature (FR-015) | Devil's advocate | M | M | Keep in-Worker synchronous work around the LLM call minimal (avoid heavy templating/crypto); check CPU-ms usage in the Cloudflare dashboard during first real test of FR-015 |
| `tech-stack.md` hint (`deployment_target: cloudflare-pages`) contradicts the actual Workers-only scaffold | Unknown unknowns | H | L | Correct the hint or add a pointer note in `AGENTS.md`/`CLAUDE.md` so future agents don't chase a Pages-based deploy path |
| `ci_default_flow: auto-deploy-on-merge` is hinted in `tech-stack.md` but `.github/workflows/ci.yml` only runs lint + build today — no deploy step exists | Research finding | H | M | Add a `wrangler deploy` step (e.g. via `cloudflare/wrangler-action`) gated on push to `master`, using `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` repo secrets |
| `wrangler rollback` reverts code but not a concurrently-shipped Supabase migration | Pre-mortem | L | M | Avoid bundling risky schema migrations with risky feature deploys; document migration state alongside each release |
| A future dependency (e.g. an LLM SDK for FR-015) assumes CommonJS/Node-only APIs `nodejs_compat` doesn't cover | Devil's advocate | M | M | Test new dependencies against a real `wrangler deploy` early, not only local `astro dev` |

## Getting Started

1. No scaffolding needed — `wrangler.jsonc`, the `@astrojs/cloudflare` adapter, and `output: "server"` are already in place.
2. Authenticate the CLI once: `npx wrangler login` (or set `CLOUDFLARE_API_TOKEN` for non-interactive/CI use).
3. Push runtime secrets ahead of the first deploy: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`.
4. Build and deploy manually the first time: `npm run build && npx wrangler deploy`.
5. To realize the `auto-deploy-on-merge` flow already recorded in `tech-stack.md`, add a deploy job to `.github/workflows/ci.yml` (e.g. `cloudflare/wrangler-action`) triggered on push to `master`, using `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` as new repository secrets alongside the existing `SUPABASE_URL`/`SUPABASE_KEY`.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (beyond noting the missing deploy step above)
- Production-scale architecture (multi-region, HA, DR)
