import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import type { Assessment } from "@/types";

export const prerender = false;

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
  if (assessment.status === "submitted") {
    return new Response(JSON.stringify({ error: "This assessment has already been submitted" }), {
      status: 409,
    });
  }

  const { count: competencyCount, error: competencyError } = await supabase
    .from("competencies")
    .select("id", { count: "exact", head: true })
    .eq("competency_model_id", assessment.competency_model_id);
  if (competencyError) {
    return new Response(JSON.stringify({ error: competencyError.message }), { status: 400 });
  }

  const { count: scoreCount, error: scoreError } = await supabase
    .from("assessment_scores")
    .select("id", { count: "exact", head: true })
    .eq("assessment_id", assessmentId);
  if (scoreError) {
    return new Response(JSON.stringify({ error: scoreError.message }), { status: 400 });
  }

  const total = competencyCount ?? 0;
  const scored = scoreCount ?? 0;
  if (scored < total) {
    return new Response(
      JSON.stringify({ error: `${total - scored} competency(ies) still need a score before you can submit` }),
      { status: 400 },
    );
  }

  // RLS's `assessments_update_own_draft_only` policy requires status='draft'
  // on the existing row: if a concurrent request already flipped it to
  // submitted, this UPDATE silently affects zero rows rather than erroring —
  // .select().maybeSingle() lets us tell the two cases apart instead of
  // reporting a false-positive success.
  const { data: updated, error } = await supabase
    .from("assessments")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", assessmentId)
    .select()
    .maybeSingle<Assessment>();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
  if (!updated) {
    return new Response(JSON.stringify({ error: "This assessment has already been submitted" }), {
      status: 409,
    });
  }

  return new Response(null, { status: 204 });
};
