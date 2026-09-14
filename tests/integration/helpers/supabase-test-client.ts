import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PILOT_PASSWORD } from "./test-users";

/**
 * Signs in as a seeded pilot user against local Supabase and returns an
 * authenticated client — real RLS is enforced through this client's JWT,
 * exactly as it would be for the real app.
 */
export async function signInAs(email: string): Promise<SupabaseClient> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL/SUPABASE_KEY are not set. Run `npx supabase start` and ensure .dev.vars (or the CI job env) provides them.",
    );
  }

  const client = createClient(url, key);
  const { error } = await client.auth.signInWithPassword({ email, password: PILOT_PASSWORD });
  if (error) {
    throw new Error(
      `Failed to sign in as ${email} against local Supabase (${url}). Is \`npx supabase start\` running and has \`npx supabase db reset\` been applied? Original error: ${error.message}`,
    );
  }

  return client;
}
