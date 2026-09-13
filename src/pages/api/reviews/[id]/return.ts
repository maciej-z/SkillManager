import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { uuidLike } from "@/lib/validation";
import type { Assessment, Profile } from "@/types";

export const prerender = false;

const reviewSchema = z.object({
  leader_comment: z.string().optional(),
  competency_comments: z.array(
    z.object({
      competency_id: uuidLike,
      leader_comment: z.string(),
    }),
  ),
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

  const parsed = reviewSchema.safeParse(await context.request.json());
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
  if (!assessment) {
    return new Response(JSON.stringify({ error: "Assessment not found" }), { status: 404 });
  }

  const { data: employeeProfile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", assessment.employee_id)
    .maybeSingle<Profile>();
  if (profileError) {
    return new Response(JSON.stringify({ error: profileError.message }), { status: 400 });
  }
  // RLS is the real enforcement boundary; this is a fast-fail UX layer.
  if (employeeProfile?.manager_id !== context.locals.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }
  if (assessment.status !== "submitted") {
    return new Response(JSON.stringify({ error: "This assessment isn't awaiting review" }), { status: 409 });
  }

  // Only ever send { leader_comment } here — never spread the raw request
  // body — since RLS authorizes the whole assessment_scores row, not just
  // this column (see plan's Critical Implementation Details).
  for (const entry of parsed.data.competency_comments) {
    const { data: updatedScore, error } = await supabase
      .from("assessment_scores")
      .update({ leader_comment: entry.leader_comment })
      .eq("assessment_id", assessmentId)
      .eq("competency_id", entry.competency_id)
      .select("competency_id")
      .maybeSingle<{ competency_id: string }>();
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    }
    if (!updatedScore) {
      return new Response(
        JSON.stringify({ error: `No score found for competency ${entry.competency_id} on this assessment` }),
        { status: 409 },
      );
    }
  }

  // RLS's `assessments_update_leader_review` policy requires status='submitted'
  // on the existing row: if a concurrent request already flipped it (approve
  // or return), this UPDATE silently affects zero rows rather than erroring —
  // .select().maybeSingle() lets us tell the two cases apart, same defense as
  // S-01's submit.ts.
  const { data: updated, error } = await supabase
    .from("assessments")
    .update({
      leader_comment: parsed.data.leader_comment ?? null,
      status: "draft",
      reviewed_by: context.locals.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", assessmentId)
    .select()
    .maybeSingle<Assessment>();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
  if (!updated) {
    return new Response(JSON.stringify({ error: "This assessment is no longer awaiting review" }), {
      status: 409,
    });
  }

  return new Response(null, { status: 204 });
};
