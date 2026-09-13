import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import type { CompetencyModel } from "@/types";

export const prerender = false;

const competencyModelSchema = z.object({
  version: z.number().int().positive(),
  is_active: z.boolean(),
});

export const GET: APIRoute = async (context) => {
  if (context.locals.profile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase is not configured" }), { status: 503 });
  }

  const { data, error } = await supabase
    .from("competency_models")
    .select("*")
    .order("version", { ascending: false })
    .overrideTypes<CompetencyModel[], { merge: false }>();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }

  return new Response(JSON.stringify(data), { status: 200 });
};

export const POST: APIRoute = async (context) => {
  if (context.locals.profile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase is not configured" }), { status: 503 });
  }

  const parsed = competencyModelSchema.safeParse(await context.request.json());
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: z.treeifyError(parsed.error) }), { status: 400 });
  }

  // Insert as inactive first, then flip activation atomically below — an
  // insert with is_active: true would race the partial unique index against
  // whichever row is currently active.
  const { data, error } = await supabase
    .from("competency_models")
    .insert({ ...parsed.data, is_active: false })
    .select()
    .single<CompetencyModel>();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }

  if (parsed.data.is_active) {
    // Single atomic statement: activates this row and deactivates every
    // other row in one transaction, so no request can observe zero or two
    // active models.
    const { error: activateError } = await supabase.rpc("activate_competency_model", {
      target_id: data.id,
    });
    if (activateError) {
      return new Response(JSON.stringify({ error: activateError.message }), { status: 400 });
    }
    data.is_active = true;
  }

  return new Response(JSON.stringify(data), { status: 201 });
};
