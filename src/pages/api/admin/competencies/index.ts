import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import type { Competency } from "@/types";

export const prerender = false;

// Postgres's uuid type (and our seed data) doesn't enforce RFC 4122
// version/variant bits — z.uuid() does, so match the looser 8-4-4-4-12 hex
// shape instead.
const uuidLike = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid UUID");

const competencySchema = z.object({
  competency_model_id: uuidLike,
  name: z.string().min(1),
  description: z.string().optional(),
  expected_proficiency_level: z.number().int().min(1).max(5),
});

export const GET: APIRoute = async (context) => {
  if (context.locals.profile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase is not configured" }), { status: 503 });
  }

  const competencyModelId = context.url.searchParams.get("competency_model_id");
  if (!competencyModelId) {
    return new Response(JSON.stringify({ error: "Missing competency_model_id query param" }), {
      status: 400,
    });
  }

  const { data, error } = await supabase
    .from("competencies")
    .select("*")
    .eq("competency_model_id", competencyModelId)
    .order("name");

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

  const parsed = competencySchema.safeParse(await context.request.json());
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: z.treeifyError(parsed.error) }), { status: 400 });
  }

  const { data, error } = await supabase
    .from("competencies")
    .insert(parsed.data)
    .select()
    .single()
    .overrideTypes<Competency, { merge: false }>();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }

  return new Response(JSON.stringify(data), { status: 201 });
};
