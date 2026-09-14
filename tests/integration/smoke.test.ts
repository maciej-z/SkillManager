import { describe, it, expect } from "vitest";
import { signInAs } from "./helpers/supabase-test-client";
import { TEST_USERS, TEST_ASSESSMENTS } from "./helpers/test-users";
import type { Assessment } from "@/types";

// Proves the whole chain — local Supabase reachable, password sign-in
// works, RLS is actually live — before any risk-specific test depends on
// it. The second assertion is the one that matters: if RLS scoping were
// broken, Alice would see Bob's row too.
describe("test harness smoke test", () => {
  it("a signed-in user can read their own assessment", async () => {
    const bob = await signInAs(TEST_USERS.employeeBob.email);

    const { data, error } = await bob
      .from("assessments")
      .select("*")
      .eq("id", TEST_ASSESSMENTS.bobSubmitted)
      .maybeSingle<Assessment>();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.employee_id).toBe(TEST_USERS.employeeBob.id);
  });

  it("a signed-in user cannot read another employee's assessment (RLS scoping is live)", async () => {
    const alice = await signInAs(TEST_USERS.employeeAlice.email);

    const { data, error } = await alice
      .from("assessments")
      .select("*")
      .eq("id", TEST_ASSESSMENTS.bobSubmitted)
      .maybeSingle<Assessment>();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});
