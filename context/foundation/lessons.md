# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## React islands can crash/blank during astro dev's SSR pass

**Context**: astro.config.mjs:15-33 (Vite optimizeDeps.include pin, Phase 4 of role-and-competency-model-foundation); src/pages/admin/profiles.astro:24-29 (client:only="react" workaround)

**Problem**: Adding new React islands using radix-ui/shadcn components (e.g. Select) can trigger a dev-server-only bug: Vite's on-disk dependency-optimization cache can go stale across restarts, causing these islands to render blank or throw during Astro's SSR pass in `astro dev`. This does not necessarily affect the production `astro build`/`preview` output, but is easy to mistake for a real bug.

**Rule**: When adding a new React island that uses radix-ui/shadcn primitives (Select, Dialog, etc.), pin its runtime deps into `vite.optimizeDeps.include` in `astro.config.mjs`. If the island still renders blank or crashes only in `astro dev`, fall back to `client:only="react"` for that specific island rather than `client:load`, and separately confirm production behavior via `astro build && astro preview` before treating it as fixed.

**Applies to**: Any new `.astro` page or component adding a `client:load`/`client:only` React island backed by radix-ui or shadcn/ui.
