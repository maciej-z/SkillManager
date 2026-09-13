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

  // Activating a new model deactivates whichever one was active — app-level,
  // backstopped by the partial unique index on competency_models(is_active).
  if (parsed.data.is_active) {
    const { error: deactivateError } = await supabase
      .from("competency_models")
      .update({ is_active: false })
      .eq("is_active", true);
    if (deactivateError) {
      return new Response(JSON.stringify({ error: deactivateError.message }), { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("competency_models")
    .insert(parsed.data)
    .select()
    .single()
    .overrideTypes<CompetencyModel, { merge: false }>();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }

  return new Response(JSON.stringify(data), { status: 201 });
};
