---
starter_id: 10x-astro-starter
package_manager: npm
project_name: skill-manager
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

SkillManager is a solo-built PoC web app shipping in about a week, with role-based login (Employee/Competence Leader) and an AI-generated development plan step — both point straight at the recommended default for (web, js). 10x Astro Starter bundles Astro + React + TypeScript + Supabase (Postgres + auth + storage) + Cloudflare Pages/Workers into a single agent-friendly stack, clearing all four agent-friendly gates, so auth and the database layer are handled out of the box rather than assembled by hand. Its bootstrapper confidence is first-class — registered with a valid CLI, expected to work smoothly though not yet battle-tested end-to-end. The AI-generated development plan (FR-015) is an application-level integration this starter does not ship by default; it will need to be added on top regardless of starter choice. CI runs on GitHub Actions with auto-deploy-on-merge, and deployment defaults to Cloudflare Pages — exactly what the starter ships with.
