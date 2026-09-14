# SkillManager

SkillManager is a competency assessment and development-planning tool for organizations. Employees self-assess against a shared competency model, their Competence Leader reviews and approves the assessment, and the system identifies the gaps that matter and generates a personalized, AI-driven development plan from them — turning ad-hoc spreadsheets and hallway conversations into a structured, trustworthy pipeline for people development and staffing decisions.

## Tech Stack

- [Astro](https://astro.build/) v6 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/maciej-z/SkillManager.git
cd SkillManager
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier
- `npm run test` - Run the integration test suite once (requires local Supabase — see [Supabase Configuration](#supabase-configuration))
- `npm run test:watch` - Run the test suite in watch mode

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ ├── lib/ # Services/helpers (Supabase client, AI plan generation, ...)
│ └── assets/ # Static assets
├── public/ # Public assets
├── supabase/ # Migrations (supabase/migrations) + pilot seed data (seed.sql)
├── tests/ # Vitest integration tests (RLS + route handlers)
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication and as its Postgres database — the schema (`profiles`, `competency_models`, `competencies`, `assessments`, `assessment_scores`, `development_plans`, `development_plan_gaps`) lives in `supabase/migrations/`, with row-level security enabled on every table. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM. The `supabase/` folder (config, migrations, pilot seed data) is already committed to this repo, so there's no `supabase init` step.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Start the local stack and apply migrations + seed data (downloads Docker images on first run):

```bash
npx supabase start
npx supabase db reset
```

3. Copy the credentials printed by `supabase start` into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

4. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`. Re-run `npx supabase db reset` any time you want a clean local database — it re-applies every migration and re-seeds the pilot accounts (`supabase/seed.sql`).

### AI plan generation (optional)

Set `OPENROUTER_API_KEY` in `.env`/`.dev.vars` to enable real AI-generated development-plan actions (`src/lib/ai.ts`). Without it, the system falls back to a deterministic stub (canned recommended actions) — this is fine for local development, and is what the integration test suite runs against.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

## Routes

| Route                      | Description                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `/auth/signin`             | Email/password sign-in form                                                                                                                  |
| `/auth/signup`             | Email/password sign-up form                                                                                                                  |
| `/auth/confirm-email`      | Post-signup "check your inbox" page                                                                                                          |
| `/dashboard`               | Role-based landing page — redirects an Employee straight to `/assessment`; a Competence Leader sees their team's most common competency gaps |
| `/assessment`              | Employee's self-assessment: score every competency, save as draft, submit for review; view the AI-generated development plan once approved   |
| `/reviews`                 | Competence Leader's queue of reports' submitted assessments awaiting review                                                                  |
| `/reviews/[id]`            | Review a single submitted assessment: approve, return for correction, or view it once approved                                               |
| `/admin`                   | Admin-only hub, linking to profile and competency-model management                                                                           |
| `/admin/profiles`          | Admin: manage user profiles (role, manager assignment)                                                                                       |
| `/admin/competency-models` | Admin: manage competency models and their competencies                                                                                       |

All routes above except `/auth/*` require authentication (redirect to `/auth/signin` otherwise); `/admin/*` additionally requires the `admin` role (redirect to `/dashboard` otherwise). Route protection is handled in `src/middleware.ts` — add paths to the `PROTECTED_ROUTES` array there to require authentication.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL` and `SUPABASE_KEY` as secrets in your Cloudflare dashboard or via `npx wrangler secret put`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and PR to `master`: `astro sync`, lint, then the integration test suite against a local Supabase instance (`supabase start` → `supabase db reset` → `npm run test` → `supabase stop`), and finally the production build. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets in GitHub for the build step (the test step uses locally-generated credentials, not the repository secrets).

## License

MIT
