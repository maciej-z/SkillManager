import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AssessmentScore, Competency } from "@/types";

interface Props {
  assessmentId: string;
  competencies: Competency[];
  scores: AssessmentScore[];
}

export default function ReviewForm({ assessmentId, competencies, scores }: Props) {
  const scoresByCompetencyId = new Map(scores.map((s) => [s.competency_id, s]));
  const [leaderComments, setLeaderComments] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const score of scores) {
      initial[score.competency_id] = score.leader_comment ?? "";
    }
    return initial;
  });
  const [overallComment, setOverallComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildBody() {
    return {
      leader_comment: overallComment || undefined,
      competency_comments: competencies.map((c) => ({
        competency_id: c.id,
        leader_comment: leaderComments[c.id] ?? "",
      })),
    };
  }

  async function handleDecision(action: "approve" | "return") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/reviews/${assessmentId}/${action}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody()),
    });
    setBusy(false);
    if (res.ok) {
      if (action === "approve") {
        // Fire-and-forget: must never delay or fail the approve flow itself.
        // The view-time fallback in DevelopmentPlanView picks it up if this
        // request is lost (navigation, network blip).
        void fetch(`/api/plans/${assessmentId}/generate`, { method: "POST" });
      }
      window.location.reload();
    } else {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `Failed to ${action}`);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {competencies.map((competency) => {
        const score = scoresByCompetencyId.get(competency.id);
        return (
          <div key={competency.id} className="rounded-lg border p-4">
            <div className="mb-1 font-medium">{competency.name}</div>
            <div className="text-muted-foreground mb-2 text-sm">Employee score: {score?.score ?? "—"}</div>
            {score?.comment && <p className="text-muted-foreground mb-3 text-sm">{score.comment}</p>}
            <Textarea
              placeholder="Your comment on this competency"
              value={leaderComments[competency.id] ?? ""}
              onChange={(e) => {
                setLeaderComments((prev) => ({ ...prev, [competency.id]: e.target.value }));
              }}
            />
          </div>
        );
      })}

      <div>
        <div className="mb-1 font-medium">Overall comment</div>
        <Textarea
          placeholder="Optional overall comment"
          value={overallComment}
          onChange={(e) => {
            setOverallComment(e.target.value);
          }}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            void handleDecision("return");
          }}
        >
          Return for Correction
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            void handleDecision("approve");
          }}
        >
          Approve
        </Button>
        {error && <span className="text-destructive text-sm">{error}</span>}
      </div>
    </div>
  );
}
