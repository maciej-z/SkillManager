import type { APIContext } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/types";

/**
 * Route handlers call `createClient(context.request.headers, context.cookies)`
 * from `@/lib/supabase` themselves. Reproducing `@supabase/ssr`'s real
 * cookie-encoded session format is non-trivial, so route-handler tests mock
 * `@/lib/supabase` instead, swapping `createClient` for a function that
 * always returns `clientHolder.current` — a real, already-signed-in client
 * (from `signInAs`), ignoring the headers/cookies arguments entirely. This
 * still exercises real RLS (the client carries a real JWT); it only skips
 * Astro's own cookie-parsing plumbing, which is middleware's concern, not
 * the route handlers' or RLS's.
 *
 * Usage in a test file (vi.mock is hoisted, but referencing an imported
 * object's property inside the factory is safe — the factory itself only
 * runs lazily, on first import of the mocked module):
 *
 *   import { vi } from "vitest";
 *   import { clientHolder, buildContext } from "./helpers/api-context";
 *   import { signInAs } from "./helpers/supabase-test-client";
 *
 *   vi.mock("@/lib/supabase", () => ({
 *     createClient: () => clientHolder.current,
 *   }));
 *
 *   const { PATCH } = await import("@/pages/api/assessments/[id]/submit");
 *   clientHolder.current = await signInAs(TEST_USERS.employeeBob.email);
 *   const context = await buildContext({ client: clientHolder.current, params: { id: assessmentId } });
 *   const response = await PATCH(context);
 */
export const clientHolder: { current: SupabaseClient | null } = { current: null };

interface BuildContextOptions {
  client: SupabaseClient;
  params?: Record<string, string | undefined>;
  method?: string;
  url?: string;
  body?: unknown;
}

export async function buildContext({
  client,
  params = {},
  method = "PATCH",
  url = "http://localhost/api/test",
  body,
}: BuildContextOptions): Promise<APIContext> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw new Error("buildContext requires a signed-in client — call signInAs() first");
  }

  const { data: profile } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>();

  const request = new Request(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return {
    params,
    request,
    cookies: {} as APIContext["cookies"],
    locals: { user, profile: profile ?? null },
  } as APIContext;
}
