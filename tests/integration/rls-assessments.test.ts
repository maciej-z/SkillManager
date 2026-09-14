import { describe, it, expect, afterEach } from "vitest";
import { signInAs } from "./helpers/supabase-test-client";
import { forceAssessmentStatus } from "./helpers/pg-admin";
import { TEST_USERS, TEST_ASSESSMENTS } from "./helpers/test-users";
import type { Assessment } from "@/types";

// Risk #4 (test-plan.md §2): a self-approval RLS gap. This test fails on
// the pre-fix policy (supabase/migrations/20260913150000...) and passes on
// the fixed one (20260914110000_assessment_status_lock_fix.sql). It must
// go through a direct write, never through an app route — every route here
// already correctly rejects bad sequences, which is exactly why testing
// through routes alone would not have caught the underlying gap.
describe("assessments_update_own_draft_only — status-lock integrity", () => {
  afterEach(async () => {
    // The second test below legitimately flips Alice's draft to
    // 'submitted' — no RLS-scoped client can ever revert that (it's the
    // lock this suite protects), so restore it here via the arrangement-
    // only pg-admin bypass, keeping repeated `npm run test` runs
    // independent without requiring a fresh `db reset` each time.
    await forceAssessmentStatus(TEST_ASSESSMENTS.aliceDraft, "draft");
  });

  it("rejects an employee self-approving their own draft assessment via a direct write", async () => {
    const alice = await signInAs(TEST_USERS.employeeAlice.email);

    const { data, error } = await alice
      .from("assessments")
      .update({
        status: "approved",
        reviewed_by: TEST_USERS.employeeAlice.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", TEST_ASSESSMENTS.aliceDraft)
      .select();

    // A WITH CHECK violation on UPDATE surfaces as a Postgres RLS error,
    // not a silent zero-rows result (that's the USING-mismatch shape,
    // e.g. targeting someone else's row — a different case entirely).
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/row-level security/i);
    expect(data).toBeNull();
  });

  it("still allows the legitimate draft -> submitted transition", async () => {
    const alice = await signInAs(TEST_USERS.employeeAlice.email);

    const { data, error } = await alice
      .from("assessments")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", TEST_ASSESSMENTS.aliceDraft)
      .select()
      .maybeSingle<Assessment>();

    expect(error).toBeNull();
    expect(data?.status).toBe("submitted");
  });
});

// Risk #1 (test-plan.md §2): general ownership/manager-boundary coverage on
// assessments and assessment_scores, using the cross-manager negative
// fixture that already exists in seed data (Dana is not Bob's manager —
// Junior Leader is).
describe("assessments & assessment_scores — ownership and manager boundaries", () => {
  it("a non-manager leader cannot read a report's submitted assessment", async () => {
    const dana = await signInAs(TEST_USERS.leaderDana.email);

    const { data, error } = await dana
      .from("assessments")
      .select("*")
      .eq("id", TEST_ASSESSMENTS.bobSubmitted)
      .maybeSingle<Assessment>();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("a non-manager leader cannot approve a report's submitted assessment", async () => {
    const dana = await signInAs(TEST_USERS.leaderDana.email);

    const { data, error } = await dana
      .from("assessments")
      .update({ status: "approved", reviewed_by: TEST_USERS.leaderDana.id, reviewed_at: new Date().toISOString() })
      .eq("id", TEST_ASSESSMENTS.bobSubmitted)
      .select();

    // USING excludes the row entirely (Dana isn't Bob's manager) — a
    // silent zero-rows match, not an RLS-violation error. Different shape
    // from the WITH CHECK failure above; both are real rejection paths.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("an employee cannot edit their own scores after submission", async () => {
    const bob = await signInAs(TEST_USERS.employeeBob.email);

    const { data, error } = await bob
      .from("assessment_scores")
      .update({ score: 1 })
      .eq("assessment_id", TEST_ASSESSMENTS.bobSubmitted)
      .eq("competency_id", "77777777-7777-7777-7777-777777777771")
      .select();

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("characterizes the documented, accepted gap: a manager's direct write CAN touch score, not just leader_comment", async () => {
    // assessment_scores_update_leader_review authorizes the whole row —
    // RLS has no column-level granularity here (see the policy's own
    // migration comment). Only the app route (approve.ts) restricts a
    // leader's write to { leader_comment }. This test characterizes that
    // real, accepted-by-design behavior so a future migration can't
    // silently tighten or loosen it without this test flagging the change.
    const juniorLeader = await signInAs(TEST_USERS.juniorLeader.email);
    const competencyId = "77777777-7777-7777-7777-777777777771";

    const { data: before } = await juniorLeader
      .from("assessment_scores")
      .select("score")
      .eq("assessment_id", TEST_ASSESSMENTS.bobSubmitted)
      .eq("competency_id", competencyId)
      .single<{ score: number }>();
    const originalScore = before?.score;

    const { data: updated, error } = await juniorLeader
      .from("assessment_scores")
      .update({ score: 5 })
      .eq("assessment_id", TEST_ASSESSMENTS.bobSubmitted)
      .eq("competency_id", competencyId)
      .select("score")
      .single<{ score: number }>();

    expect(error).toBeNull();
    expect(updated?.score).toBe(5);

    // Restore — Junior Leader is authorized to write this row any number
    // of times while the assessment stays 'submitted', so no pg-admin
    // bypass is needed to clean up.
    await juniorLeader
      .from("assessment_scores")
      .update({ score: originalScore })
      .eq("assessment_id", TEST_ASSESSMENTS.bobSubmitted)
      .eq("competency_id", competencyId);
  });
});
