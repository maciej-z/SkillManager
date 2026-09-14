import { describe, it, expect, afterEach } from "vitest";
import { signInAs } from "./helpers/supabase-test-client";
import { forceAssessmentStatus, deleteDevelopmentPlansForAssessment } from "./helpers/pg-admin";
import { TEST_USERS, TEST_ASSESSMENTS } from "./helpers/test-users";
import type { DevelopmentPlan, DevelopmentPlanGap } from "@/types";

// Risk #2 (test-plan.md §2): development_plans_select / development_plan_gaps_select
// never checked the parent assessment's status = 'approved' — dormant
// today (nothing can move status away from 'approved'), fixed defensively
// in 20260914110100_development_plan_select_approved_fix.sql. Proving the
// fix needs a state no RLS-scoped client can produce, so this test uses
// pg-admin's direct-Postgres bypass ONLY to arrange that state — every
// assertion still goes through Frank's normal, RLS-scoped client.
describe("development_plans_select / development_plan_gaps_select — approval gate", () => {
  afterEach(async () => {
    // Restore the fixture so later tests/phases (and repeated `npm run
    // test` runs) see Frank's assessment back in its seeded 'approved'
    // state, and remove the plan this test created (development_plans has
    // no DELETE policy, so RLS-scoped cleanup isn't possible).
    await deleteDevelopmentPlansForAssessment(TEST_ASSESSMENTS.frankApproved);
    await forceAssessmentStatus(TEST_ASSESSMENTS.frankApproved, "approved");
  });

  it("rejects SELECT on a plan/gap once the parent assessment is no longer approved", async () => {
    const frank = await signInAs(TEST_USERS.employeeFrank.email);

    const { data: plan, error: insertError } = await frank
      .from("development_plans")
      .insert({ assessment_id: TEST_ASSESSMENTS.frankApproved, status: "ready" })
      .select()
      .single<DevelopmentPlan>();
    expect(insertError).toBeNull();
    if (!plan) throw new Error("plan insert did not return a row");

    const { error: gapInsertError } = await frank.from("development_plan_gaps").insert({
      development_plan_id: plan.id,
      competency_id: "77777777-7777-7777-7777-777777777776",
      gap_size: 1,
      rank: 1,
      recommended_actions: ["Shadow a mentoring session"],
    });
    expect(gapInsertError).toBeNull();

    // Sanity check: visible while the assessment is genuinely approved.
    const { data: visiblePlan } = await frank
      .from("development_plans")
      .select("*")
      .eq("assessment_id", TEST_ASSESSMENTS.frankApproved)
      .maybeSingle<DevelopmentPlan>();
    expect(visiblePlan).not.toBeNull();

    // Arrangement-only bypass: force the parent assessment away from
    // 'approved' — a state no RLS-scoped client could ever produce.
    await forceAssessmentStatus(TEST_ASSESSMENTS.frankApproved, "submitted");

    const { data: hiddenPlan } = await frank
      .from("development_plans")
      .select("*")
      .eq("assessment_id", TEST_ASSESSMENTS.frankApproved)
      .maybeSingle<DevelopmentPlan>();
    expect(hiddenPlan).toBeNull();

    const { data: hiddenGaps } = await frank
      .from("development_plan_gaps")
      .select("*")
      .eq("development_plan_id", plan.id);
    expect(hiddenGaps satisfies DevelopmentPlanGap[] | null).toEqual([]);
  });

  it("scopes plan visibility to the owning employee and their direct manager (Risk #1)", async () => {
    const frank = await signInAs(TEST_USERS.employeeFrank.email);
    const { data: plan } = await frank
      .from("development_plans")
      .insert({ assessment_id: TEST_ASSESSMENTS.frankApproved, status: "ready" })
      .select()
      .single<DevelopmentPlan>();
    expect(plan).not.toBeNull();

    // Gina is not Frank's manager (Dana is) — must not see Frank's plan.
    const gina = await signInAs(TEST_USERS.leaderGina.email);
    const { data: ginaView } = await gina
      .from("development_plans")
      .select("*")
      .eq("assessment_id", TEST_ASSESSMENTS.frankApproved)
      .maybeSingle<DevelopmentPlan>();
    expect(ginaView).toBeNull();

    // An unrelated employee must not see Frank's plan either.
    const alice = await signInAs(TEST_USERS.employeeAlice.email);
    const { data: aliceView } = await alice
      .from("development_plans")
      .select("*")
      .eq("assessment_id", TEST_ASSESSMENTS.frankApproved)
      .maybeSingle<DevelopmentPlan>();
    expect(aliceView).toBeNull();
  });
});
