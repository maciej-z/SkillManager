import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const updateCompetencyModelSchema = z
  .object({
    version: z.number().int().positive().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => data.version !== undefined || data.is_active !== undefined, {
    message: "At least one of version or is_active must be provided",
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
    return new Response(JSON.stringify({ error: "Missing competency model id" }), { status: 400 });
  }

  const parsed = updateCompetencyModelSchema.safeParse(await context.request.json());
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: z.treeifyError(parsed.error) }), { status: 400 });
  }

  if (parsed.data.is_active) {
    // Single atomic statement: activates this row and deactivates every
    // other row in one transaction, so no request can observe zero or two
    // active models.
    const { error: activateError } = await supabase.rpc("activate_competency_model", {
      target_id: targetId,
    });
    if (activateError) {
      return new Response(JSON.stringify({ error: activateError.message }), { status: 400 });
    }
  }

  const { error } = await supabase.from("competency_models").update(parsed.data).eq("id", targetId);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }

  return new Response(null, { status: 204 });
};

export const DELETE: APIRoute = async (context) => {
  if (context.locals.profile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase is not configured" }), { status: 503 });
  }

  const targetId = context.params.id;
  if (!targetId) {
    return new Response(JSON.stringify({ error: "Missing competency model id" }), { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("competency_models")
    .select("is_active")
    .eq("id", targetId)
    .maybeSingle<{ is_active: boolean }>();
  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 400 });
  }
  if (existing?.is_active) {
    return new Response(
      JSON.stringify({ error: "Cannot delete the active competency model — activate a replacement first" }),
      { status: 400 },
    );
  }

  const { error } = await supabase.from("competency_models").delete().eq("id", targetId);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }

  return new Response(null, { status: 204 });
};
