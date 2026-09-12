---
bootstrapped_at: 2026-09-08T23:13:54Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: skill-manager
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
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
```

### Why this stack

SkillManager is a solo-built PoC web app shipping in about a week, with role-based login (Employee/Competence Leader) and an AI-generated development plan step — both point straight at the recommended default for (web, js). 10x Astro Starter bundles Astro + React + TypeScript + Supabase (Postgres + auth + storage) + Cloudflare Pages/Workers into a single agent-friendly stack, clearing all four agent-friendly gates, so auth and the database layer are handled out of the box rather than assembled by hand. Its bootstrapper confidence is first-class — registered with a valid CLI, expected to work smoothly though not yet battle-tested end-to-end. The AI-generated development plan (FR-015) is an application-level integration this starter does not ship by default; it will need to be added on top regardless of starter choice. CI runs on GitHub Actions with auto-deploy-on-merge, and deployment defaults to Cloudflare Pages — exactly what the starter ships with.

## Pre-scaffold verification

| Signal      | Value                                          | Severity | Notes                                    |
| ----------- | ----------------------------------------------- | -------- | ----------------------------------------- |
| npm package | not run                                         | n/a      | `cmd_template` starts with `git clone`; no npm-distributed CLI to check |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-08-22 | fresh    | from card `docs_url`                      |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 21 top-level entries (.env.example, .github, .gitignore, .husky, .nvmrc, .prettierrc.json, .vscode, CLAUDE.md, README.md, astro.config.mjs, components.json, eslint.config.js, node_modules, package-lock.json, package.json, public, src, supabase, tsconfig.json, wrangler.jsonc)
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently (cwd had no pre-existing .gitignore)
**.bootstrap-scaffold cleanup**: deleted (cloned `.git/` removed before move-up, per git-clone strategy)

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 2 CRITICAL, 13 HIGH, 8 MODERATE, 3 LOW
**Direct vs transitive**: 1/0/2/0 direct of total 2/13/8/3 (direct = a package this project depends on explicitly; transitive = pulled in by a direct dependency)

#### CRITICAL findings
- **astro** (direct, range <=7.2.7) — multiple advisories: XSS via unescaped attribute names in spread props (and incomplete-fix variant), XSS via unescaped `transition:*` directive values on hydrated islands, reflected XSS via unescaped View Transition animation properties, Host header SSRF in prerendered error page fetch, reflected XSS via unescaped slot name, remote code execution through AVIF image optimization, authorization bypass from missing path-segment boundary check when stripping the configured base. Fix: upgrade astro past 7.2.7.
- **tar** (transitive via supabase, range <=7.5.20) — PAX size override causing tar parser interpretation differential (file smuggling), process crash via PAX numeric path type confusion, decompression/parse DoS via unlimited input, negative entry size infinite loop, uncaught exception DoS via NUL byte in PAX records, uncontrolled recursion DoS. Fix: upgrade tar past 7.5.20 (pulled in transitively; wait on supabase's dependency bump or override).

#### HIGH findings
- **brace-expansion** (transitive) — DoS via exponential-time / unbounded expansion of `{}` groups (multiple CVE variants).
- **browserslist** (transitive) — unbounded memory growth via distinct query results; uncaught crash via untrusted stats file.
- **devalue** (transitive, via Svelte tooling) — DoS via sparse array deserialization.
- **fast-uri** (transitive) — host confusion / SSRF via malformed IPv6 and backslash authority delimiters.
- **js-yaml** (transitive) — quadratic-complexity DoS in merge-key / `!!omap` handling.
- **miniflare** (transitive, via wrangler/sharp/undici/ws) — inherits sharp/undici/ws advisories below.
- **nanoid** (transitive) — non-secure/custom generators can loop indefinitely on negative or zero size.
- **postcss** (transitive) — path traversal via sourceMappingURL auto-loading, arbitrary `.map` file disclosure.
- **sharp** (transitive) — inherited libvips/libheif CVEs.
- **svgo** (transitive) — `removeScripts` plugin leaves executable scripts intact under several bypasses.
- **undici** (transitive) — TLS validation bypass via SOCKS5 proxy, header injection, cache poisoning, and several other request-smuggling-adjacent issues.
- **vite** (transitive) — NTLMv2 hash disclosure via UNC paths on Windows; `server.fs.deny` bypass on Windows.
- **ws** (transitive) — uninitialized memory disclosure; memory exhaustion DoS via tiny fragments.

#### MODERATE findings
- **@astrojs/language-server** (transitive, editor tooling only)
- **@cloudflare/vite-plugin** (transitive via miniflare/wrangler/ws)
- **baseline-browser-mapping** (transitive) — DoS via process termination on invalid input
- **supabase** (direct, range 1.1.6 - 2.98.2) — via transitive `tar` advisory
- **volar-service-yaml** (transitive, editor tooling only)
- **wrangler** (direct, range varies) — via transitive esbuild/miniflare advisories
- **yaml** (transitive) — stack overflow via deeply nested collections
- **yaml-language-server** (transitive, editor tooling only)

#### LOW / INFO findings
- **@babel/core** (transitive) — arbitrary file read via sourceMappingURL comment
- **esbuild** (transitive) — arbitrary file read on Windows dev server
- **postcss-selector-parser** (transitive) — DoS via uncontrolled AST recursion

## Hints recorded but not acted on

| Hint                     | Value            |
| ------------------------ | ---------------- |
| bootstrapper_confidence  | first-class       |
| quality_override         | false             |
| path_taken               | standard          |
| self_check_answers       | null              |
| team_size                | solo              |
| deployment_target        | cloudflare-pages  |
| ci_provider              | github-actions    |
| ci_default_flow          | auto-deploy-on-merge |
| has_auth                 | true              |
| has_payments             | false             |
| has_realtime             | false             |
| has_ai                   | true              |
| has_background_jobs      | false             |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Address the audit findings per your project's risk tolerance — start with the direct-and-critical `astro` finding (upgrade past 7.2.7), since it's both direct and immediately actionable; the transitive `tar` critical will likely resolve once `supabase` bumps its own dependency.
- Review `.env.example` and configure Supabase credentials before running the dev server.
