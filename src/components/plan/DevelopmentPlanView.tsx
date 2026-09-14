import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Competency, DevelopmentPlan, DevelopmentPlanGap } from "@/types";

interface Props {
  assessmentId: string;
  plan: DevelopmentPlan | null;
  gaps: (DevelopmentPlanGap & { competency: Competency })[];
}

export default function DevelopmentPlanView({ assessmentId, plan, gaps }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/plans/${assessmentId}/generate`, { method: "POST" });
    setBusy(false);
    if (res.ok) {
      window.location.reload();
    } else {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to generate development plan");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">Development Plan</h2>

      {(!plan || plan.status === "pending") && (
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground mb-3 text-sm">
            {plan
              ? "Your development plan is still generating — check back shortly."
              : "Your development plan hasn't started generating yet."}
          </p>
          <Button disabled={busy} onClick={() => void handleGenerate()}>
            {busy ? "Checking..." : "Check for development plan"}
          </Button>
          {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
        </div>
      )}

      {plan?.status === "failed" && (
        <div className="rounded-lg border p-4">
          <p className="text-destructive mb-3 text-sm">{plan.error_message ?? "Development plan generation failed."}</p>
          <Button disabled={busy} onClick={() => void handleGenerate()}>
            {busy ? "Retrying..." : "Retry"}
          </Button>
          {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
        </div>
      )}

      {plan?.status === "ready" && gaps.length === 0 && (
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">Met or exceeded every competency — no gaps identified.</p>
        </div>
      )}

      {plan?.status === "ready" &&
        gaps.length > 0 &&
        [...gaps]
          .sort((a, b) => a.rank - b.rank)
          .map((gap) => (
            <div key={gap.id} className="rounded-lg border p-4">
              <div className="mb-1 font-medium">{gap.competency.name}</div>
              <div className="text-muted-foreground mb-2 text-sm">Gap size: {gap.gap_size}</div>
              {gap.recommended_actions && gap.recommended_actions.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {gap.recommended_actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
    </div>
  );
}
