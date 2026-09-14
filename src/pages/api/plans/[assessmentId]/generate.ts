import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { generateDevelopmentPlanActions } from "@/lib/ai";
import type { Assessment, Competency, DevelopmentPlan, Profile } from "@/types";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase is not configured" }), { status: 503 });
  }

  const assessmentId = context.params.assessmentId;
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
  const isEmployee = assessment.employee_id === context.locals.user.id;
  const isManager = employeeProfile?.manager_id === context.locals.user.id;
  if (!isEmployee && !isManager) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  if (assessment.status !== "approved") {
    return new Response(JSON.stringify({ error: "This assessment has not been approved yet" }), { status: 409 });
  }

  // Race-safe claim: two independent triggers (the leader's eager
  // post-approve call, and the view-time fallback from either role) can both
  // reach this route for the same assessment. Whichever insert lands first
  // "claims" generation via the unique(assessment_id) constraint; the loser
  // sees an empty `.select()` result (DO NOTHING) and just re-reads the
  // current state instead of generating a second time.
  const { data: claimed, error: claimError } = await supabase
    .from("development_plans")
    .upsert({ assessment_id: assessmentId }, { onConflict: "assessment_id", ignoreDuplicates: true })
    .select()
    .overrideTypes<DevelopmentPlan[], { merge: false }>();
  if (claimError) {
    return new Response(JSON.stringify({ error: claimError.message }), { status: 400 });
  }

  if (claimed.length === 0) {
    const { data: existing, error: existingError } = await supabase
      .from("development_plans")
      .select("*")
      .eq("assessment_id", assessmentId)
      .maybeSingle<DevelopmentPlan>();
    if (existingError) {
      return new Response(JSON.stringify({ error: existingError.message }), { status: 400 });
    }
    return new Response(JSON.stringify(existing), { status: 200 });
  }

  const plan = claimed[0];

  const { data: competencies, error: competenciesError } = await supabase
    .from("competencies")
    .select("*")
    .eq("competency_model_id", assessment.competency_model_id)
    .order("created_at", { ascending: true })
    .overrideTypes<Competency[], { merge: false }>();
  if (competenciesError) {
    await supabase
      .from("development_plans")
      .update({ status: "failed", error_message: competenciesError.message })
      .eq("id", plan.id);
    return new Response(JSON.stringify({ error: competenciesError.message }), { status: 400 });
  }

  const { data: scores, error: scoresError } = await supabase
    .from("assessment_scores")
    .select("competency_id, score")
    .eq("assessment_id", assessmentId)
    .overrideTypes<{ competency_id: string; score: number }[], { merge: false }>();
  if (scoresError) {
    await supabase
      .from("development_plans")
      .update({ status: "failed", error_message: scoresError.message })
      .eq("id", plan.id);
    return new Response(JSON.stringify({ error: scoresError.message }), { status: 400 });
  }

  const scoreByCompetencyId = new Map(scores.map((s) => [s.competency_id, s.score]));
  // Only every competency the assessment actually has a score for is a
  // candidate — submit.ts already guarantees full coverage before an
  // assessment can be submitted, but this stays defensive rather than
  // assuming that invariant holds.
  const allScores: { competency: Competency; score: number }[] = [];
  for (const competency of competencies) {
    const score = scoreByCompetencyId.get(competency.id);
    if (score !== undefined) {
      allScores.push({ competency, score });
    }
  }

  // Only a score below the expected level is a gap at all. Sorting by
  // -gap_size on an array already in competency-creation order relies on
  // Array.prototype.sort's stability to break ties by that creation order,
  // per the plan's Key Discoveries.
  const gaps = allScores
    .filter(({ competency, score }) => score < competency.expected_proficiency_level)
    .map(({ competency, score }) => ({
      competency,
      score,
      gap_size: competency.expected_proficiency_level - score,
    }))
    .sort((a, b) => b.gap_size - a.gap_size);

  if (gaps.length === 0) {
    const { data: updated, error: updateError } = await supabase
      .from("development_plans")
      .update({ status: "ready", generated_at: new Date().toISOString() })
      .eq("id", plan.id)
      .select()
      .maybeSingle<DevelopmentPlan>();
    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), { status: 400 });
    }
    return new Response(JSON.stringify(updated), { status: 200 });
  }

  const topGaps = gaps.slice(0, 3);

  try {
    const { raw, actionsByCompetencyId } = await generateDevelopmentPlanActions(
      topGaps.map(({ competency, score }) => ({ competency, score })),
      allScores,
    );

    const gapRows = gaps.map((gap, index) => ({
      development_plan_id: plan.id,
      competency_id: gap.competency.id,
      gap_size: gap.gap_size,
      rank: index + 1,
      recommended_actions: actionsByCompetencyId[gap.competency.id] ?? null,
    }));

    const { error: gapsInsertError } = await supabase.from("development_plan_gaps").insert(gapRows);
    if (gapsInsertError) {
      throw new Error(gapsInsertError.message);
    }

    const { data: updated, error: updateError } = await supabase
      .from("development_plans")
      .update({ status: "ready", raw_response: raw, generated_at: new Date().toISOString() })
      .eq("id", plan.id)
      .select()
      .maybeSingle<DevelopmentPlan>();
    if (updateError) {
      throw new Error(updateError.message);
    }

    return new Response(JSON.stringify(updated), { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Plan generation failed";
    const { data: failed } = await supabase
      .from("development_plans")
      .update({ status: "failed", error_message: message })
      .eq("id", plan.id)
      .select()
      .maybeSingle<DevelopmentPlan>();
    return new Response(JSON.stringify(failed), { status: 200 });
  }
};
