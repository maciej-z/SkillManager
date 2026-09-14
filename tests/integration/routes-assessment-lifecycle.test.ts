import { describe, it, expect, afterEach, vi } from "vitest";
import { signInAs } from "./helpers/supabase-test-client";
import { clientHolder, buildContext } from "./helpers/api-context";
import { deleteDevelopmentPlansForAssessment } from "./helpers/pg-admin";
import { TEST_USERS, TEST_ASSESSMENTS } from "./helpers/test-users";
import type { DevelopmentPlan } from "@/types";

// Route handlers create their own client via createClient(headers, cookies)
// — mocked here to return the per-test signed-in client instead (see
// api-context.ts). generate.ts's chain also imports src/lib/ai.ts, which
// reads OPENROUTER_API_KEY from astro:env/server at module load — that
// virtual module only resolves inside Astro's Vite pipeline, so it's
// mocked directly too. Forcing it undefined also gives deterministic stub
// output, per the codebase's existing null-tolerant convention.
vi.mock("@/lib/supabase", () => ({ createClient: () => clientHolder.current }));
vi.mock("astro:env/server", () => ({ OPENROUTER_API_KEY: undefined }));

const { PATCH: submit } = await import("@/pages/api/assessments/[id]/submit");
const { PATCH: approve } = await import("@/pages/api/reviews/[id]/approve");
const { PATCH: returnForCorrection } = await import("@/pages/api/reviews/[id]/return");
const { POST: generate } = await import("@/pages/api/plans/[assessmentId]/generate");

describe("route-handler regressions — status transitions", () => {
  it("submit.ts rejects submitting an already-submitted assessment", async () => {
    const bob = await signInAs(TEST_USERS.employeeBob.email);
    clientHolder.current = bob;
    const context = await buildContext({ client: bob, params: { id: TEST_ASSESSMENTS.bobSubmitted } });

    const response = await submit(context);

    expect(response.status).toBe(409);
  });

  it("approve.ts rejects approving an already-approved assessment", async () => {
    const dana = await signInAs(TEST_USERS.leaderDana.email);
    clientHolder.current = dana;
    const context = await buildContext({
      client: dana,
      params: { id: TEST_ASSESSMENTS.frankApproved },
      body: { competency_comments: [] },
    });

    const response = await approve(context);

    expect(response.status).toBe(409);
  });

  it("return.ts rejects returning an already-approved assessment", async () => {
    const dana = await signInAs(TEST_USERS.leaderDana.email);
    clientHolder.current = dana;
    const context = await buildContext({
      client: dana,
      params: { id: TEST_ASSESSMENTS.frankApproved },
      body: { competency_comments: [] },
    });

    const response = await returnForCorrection(context);

    expect(response.status).toBe(409);
  });

  // Dana isn't Bob's manager, so RLS's assessments_select_leader hides the
  // row entirely before the route's own manager-relationship check ever
  // runs — the assessment fetch itself returns null, and both routes'
  // early "assessment not found" branch fires first. 404, not 403, is the
  // correct and accepted behavior here (already documented as such in the
  // archived S-02 plan) — RLS-first design naturally produces the more
  // conservative response.
  it("approve.ts reports not-found for a non-manager leader (RLS hides the row before the 403 check)", async () => {
    const dana = await signInAs(TEST_USERS.leaderDana.email);
    clientHolder.current = dana;
    const context = await buildContext({
      client: dana,
      params: { id: TEST_ASSESSMENTS.bobSubmitted },
      body: { competency_comments: [] },
    });

    const response = await approve(context);

    expect(response.status).toBe(404);
  });

  it("return.ts reports not-found for a non-manager leader (RLS hides the row before the 403 check)", async () => {
    const dana = await signInAs(TEST_USERS.leaderDana.email);
    clientHolder.current = dana;
    const context = await buildContext({
      client: dana,
      params: { id: TEST_ASSESSMENTS.bobSubmitted },
      body: { competency_comments: [] },
    });

    const response = await returnForCorrection(context);

    expect(response.status).toBe(404);
  });
});

describe("route-handler regressions — generate.ts", () => {
  afterEach(async () => {
    await deleteDevelopmentPlansForAssessment(TEST_ASSESSMENTS.frankApproved);
  });

  it("rejects generating a plan for a submitted (not yet approved) assessment", async () => {
    const bob = await signInAs(TEST_USERS.employeeBob.email);
    clientHolder.current = bob;
    const context = await buildContext({
      client: bob,
      params: { assessmentId: TEST_ASSESSMENTS.bobSubmitted },
      method: "POST",
    });

    const response = await generate(context);

    expect(response.status).toBe(409);
  });

  it("is race-safe: two concurrent calls on an approved assessment produce exactly one plan", async () => {
    const frank = await signInAs(TEST_USERS.employeeFrank.email);
    clientHolder.current = frank;
    const contextA = await buildContext({
      client: frank,
      params: { assessmentId: TEST_ASSESSMENTS.frankApproved },
      method: "POST",
    });
    const contextB = await buildContext({
      client: frank,
      params: { assessmentId: TEST_ASSESSMENTS.frankApproved },
      method: "POST",
    });

    const [responseA, responseB] = await Promise.all([generate(contextA), generate(contextB)]);

    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);

    const { data: plans } = await frank
      .from("development_plans")
      .select("*")
      .eq("assessment_id", TEST_ASSESSMENTS.frankApproved)
      .overrideTypes<DevelopmentPlan[], { merge: false }>();
    expect(plans).toHaveLength(1);
  });
});
