import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const updateCompetencySchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    expected_proficiency_level: z.number().int().min(1).max(5).optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined || data.description !== undefined || data.expected_proficiency_level !== undefined,
    { message: "At least one field must be provided" },
  );

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
    return new Response(JSON.stringify({ error: "Missing competency id" }), { status: 400 });
  }

  const parsed = updateCompetencySchema.safeParse(await context.request.json());
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: z.treeifyError(parsed.error) }), { status: 400 });
  }

  const { error } = await supabase.from("competencies").update(parsed.data).eq("id", targetId);
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
    return new Response(JSON.stringify({ error: "Missing competency id" }), { status: 400 });
  }

  const { error } = await supabase.from("competencies").delete().eq("id", targetId);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }

  return new Response(null, { status: 204 });
};
