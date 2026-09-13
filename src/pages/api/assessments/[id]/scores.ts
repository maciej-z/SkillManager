import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { uuidLike } from "@/lib/validation";
import type { Assessment } from "@/types";

export const prerender = false;

const scoresSchema = z.object({
  scores: z
    .array(
      z.object({
        competency_id: uuidLike,
        score: z.number().int().min(1).max(5),
        comment: z.string().optional(),
      }),
    )
    .min(1),
});

export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase is not configured" }), { status: 503 });
  }

  const assessmentId = context.params.id;
  if (!assessmentId) {
    return new Response(JSON.stringify({ error: "Missing assessment id" }), { status: 400 });
  }

  const parsed = scoresSchema.safeParse(await context.request.json());
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: z.treeifyError(parsed.error) }), { status: 400 });
  }

  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .maybeSingle<Assessment>();
  if (assessmentError) {
    return new Response(JSON.stringify({ error: assessmentError.message }), { status: 400 });
  }
  // RLS is the real enforcement boundary; this is a fast-fail UX layer.
  if (assessment?.employee_id !== context.locals.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const rows = parsed.data.scores.map((s) => ({ assessment_id: assessmentId, ...s }));
  const { error } = await supabase
    .from("assessment_scores")
    .upsert(rows, { onConflict: "assessment_id,competency_id" });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }

  return new Response(null, { status: 204 });
};
