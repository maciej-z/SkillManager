import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { AssessmentScore, Competency } from "@/types";

interface Props {
  assessmentId: string;
  competencies: Competency[];
  existingScores: AssessmentScore[];
}

interface ScoreEntry {
  score: string;
  comment: string;
}

const LEVELS = [1, 2, 3, 4, 5];

export default function AssessmentForm({ assessmentId, competencies, existingScores }: Props) {
  const [entries, setEntries] = useState<Record<string, ScoreEntry | undefined>>(() => {
    const initial: Record<string, ScoreEntry | undefined> = {};
    for (const existing of existingScores) {
      initial[existing.competency_id] = {
        score: String(existing.score),
        comment: existing.comment ?? "",
      };
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scoredCount = competencies.filter((c) => entries[c.id]?.score).length;
  const totalCount = competencies.length;
  const canSubmit = scoredCount === totalCount;

  function setScore(competencyId: string, score: string) {
    setEntries((prev) => ({ ...prev, [competencyId]: { comment: "", ...prev[competencyId], score } }));
  }

  function setComment(competencyId: string, comment: string) {
    setEntries((prev) => ({ ...prev, [competencyId]: { score: "", ...prev[competencyId], comment } }));
  }

  async function handleSaveDraft() {
    setSaving(true);
    setError(null);
    const scores = competencies
      .map((c) => ({ competencyId: c.id, entry: entries[c.id] }))
      .filter((x): x is { competencyId: string; entry: ScoreEntry } => x.entry !== undefined && x.entry.score !== "")
      .map(({ competencyId, entry }) => ({
        competency_id: competencyId,
        score: Number(entry.score),
        comment: entry.comment || undefined,
      }));
    const res = await fetch(`/api/assessments/${assessmentId}/scores`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scores }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Failed to save draft");
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    await handleSaveDraft();
    const res = await fetch(`/api/assessments/${assessmentId}/submit`, { method: "PATCH" });
    setSubmitting(false);
    if (res.ok) {
      window.location.reload();
    } else {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to submit");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        {scoredCount} of {totalCount} scored
      </p>

      {competencies.map((competency) => (
        <div key={competency.id} className="rounded-lg border p-4">
          <div className="mb-1 font-medium">{competency.name}</div>
          {competency.description && <p className="text-muted-foreground mb-3 text-sm">{competency.description}</p>}
          <RadioGroup
            className="grid-flow-col justify-start gap-4"
            value={entries[competency.id]?.score ?? ""}
            onValueChange={(value) => {
              setScore(competency.id, value);
            }}
          >
            {LEVELS.map((level) => (
              <div key={level} className="flex items-center gap-2">
                <RadioGroupItem value={String(level)} id={`${competency.id}-${level}`} />
                <Label htmlFor={`${competency.id}-${level}`}>{level}</Label>
              </div>
            ))}
          </RadioGroup>
          <Textarea
            className="mt-3"
            placeholder="Optional comment"
            value={entries[competency.id]?.comment ?? ""}
            onChange={(e) => {
              setComment(competency.id, e.target.value);
            }}
          />
        </div>
      ))}

      <div className="flex items-center gap-3">
        <Button variant="outline" disabled={saving || submitting} onClick={handleSaveDraft}>
          {saving ? "Saving..." : "Save Draft"}
        </Button>
        <Button disabled={!canSubmit || saving || submitting} onClick={handleSubmit}>
          {submitting ? "Submitting..." : "Submit"}
        </Button>
        {error && <span className="text-destructive text-sm">{error}</span>}
      </div>
    </div>
  );
}
