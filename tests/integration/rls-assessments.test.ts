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
