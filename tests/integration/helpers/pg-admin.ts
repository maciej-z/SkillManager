import { Client } from "pg";

/**
 * Connects directly to local Postgres (the Supabase CLI's well-known
 * local-only default credentials — never used against a real project),
 * bypassing RLS entirely.
 *
 * This exists for exactly ONE purpose: arranging a fixture state no
 * RLS-scoped client can ever produce today — e.g. a development_plans row
 * whose parent assessment isn't 'approved', which is otherwise
 * unreachable since assessments.status can never move away from
 * 'approved' once reached. It proves the SELECT-policy fix in
 * development_plan_select_approved_fix.sql holds if that ever becomes
 * reachable in the future.
 *
 * NEVER use this to perform or bypass an actual test assertion — the
 * assertion must always go through a normal RLS-scoped client
 * (see supabase-test-client.ts). This helper is arrangement-only.
 */
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export async function forceAssessmentStatus(assessmentId: string, status: string): Promise<void> {
  const client = new Client({ connectionString: LOCAL_DB_URL });
  await client.connect();
  try {
    await client.query("update public.assessments set status = $1 where id = $2", [status, assessmentId]);
  } finally {
    await client.end();
  }
}

/**
 * development_plans has no DELETE policy (plans are stable once created,
 * per its own migration comment) — so a test that creates one to exercise
 * SELECT-gate behavior has no RLS-scoped way to clean it up afterward.
 * This is test cleanup, not an assertion bypass.
 */
export async function deleteDevelopmentPlansForAssessment(assessmentId: string): Promise<void> {
  const client = new Client({ connectionString: LOCAL_DB_URL });
  await client.connect();
  try {
    await client.query("delete from public.development_plans where assessment_id = $1", [assessmentId]);
  } finally {
    await client.end();
  }
}
