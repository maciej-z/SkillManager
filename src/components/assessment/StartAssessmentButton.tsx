import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function StartAssessmentButton() {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setStarting(true);
    setError(null);
    const res = await fetch("/api/assessments", { method: "POST" });
    setStarting(false);
    if (res.ok) {
      window.location.reload();
    } else {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to start assessment");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button disabled={starting} onClick={handleStart}>
        {starting ? "Starting..." : "Start assessment"}
      </Button>
      {error && <span className="text-destructive text-sm">{error}</span>}
    </div>
  );
}
