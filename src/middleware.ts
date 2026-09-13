import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import type { Profile } from "@/types";

const PROTECTED_ROUTES = ["/dashboard", "/admin", "/assessment", "/reviews"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    if (context.locals.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", context.locals.user.id)
        .maybeSingle<Profile>();
      context.locals.profile = profile;
    } else {
      context.locals.profile = null;
    }
  } else {
    context.locals.user = null;
    context.locals.profile = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
    if (context.url.pathname.startsWith("/admin") && context.locals.profile?.role !== "admin") {
      return context.redirect("/dashboard");
    }
  }

  return next();
});
