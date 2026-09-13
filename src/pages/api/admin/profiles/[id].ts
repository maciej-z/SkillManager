import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

// Postgres's uuid type (and our seed data) doesn't enforce RFC 4122
// version/variant bits — z.uuid() does, so match the looser 8-4-4-4-12 hex
// shape instead.
const uuidLike = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid UUID");

const updateProfileSchema = z
  .object({
    role: z.enum(["employee", "competence_leader", "admin"]).optional(),
    manager_id: uuidLike.optional(),
  })
  .refine((data) => data.role !== undefined || data.manager_id !== undefined, {
    message: "At least one of role or manager_id must be provided",
  });

export const PATCH: APIRoute = async (context) => {
  if (context.locals.profile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase is not configured" }), { status: 503 });
  }

  const targetId = context.params.id;
  if (!targetId) {
    return new Response(JSON.stringify({ error: "Missing profile id" }), { status: 400 });
  }

  const parsed = updateProfileSchema.safeParse(await context.request.json());
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: z.treeifyError(parsed.error) }), { status: 400 });
  }

  // RLS profiles_update_admin_only is the real enforcement boundary; the role
  // check above is a fast-fail UX layer only.
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", targetId);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }

  return new Response(null, { status: 204 });
};
