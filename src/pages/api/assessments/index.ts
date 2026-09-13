import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import type { Assessment, CompetencyModel } from "@/types";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase is not configured" }), { status: 503 });
  }

  const { data: activeModel, error: activeModelError } = await supabase
    .from("competency_models")
    .select("*")
    .eq("is_active", true)
    .maybeSingle<CompetencyModel>();
  if (activeModelError) {
    return new Response(JSON.stringify({ error: activeModelError.message }), { status: 400 });
  }
  if (!activeModel) {
    return new Response(JSON.stringify({ error: "No competency model is currently active" }), {
      status: 400,
    });
  }

  const { data, error } = await supabase
    .from("assessments")
    .insert({ employee_id: context.locals.user.id, competency_model_id: activeModel.id })
    .select()
    .single<Assessment>();
  if (error) {
    if (error.code === "23505") {
      return new Response(JSON.stringify({ error: "You already have an assessment for this competency model" }), {
        status: 409,
      });
    }
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }

  return new Response(JSON.stringify(data), { status: 201 });
};
