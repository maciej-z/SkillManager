import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  nextVersion: number;
}

export default function CreateCompetencyModelForm({ nextVersion }: Props) {
  const [version, setVersion] = useState(nextVersion);
  const [activate, setActivate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/competency-models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version, is_active: activate }),
    });
    setSaving(false);
    if (res.ok) {
      window.location.reload();
    } else {
      setError("Failed to create model version");
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
      <div>
        <label htmlFor="new-version" className="text-muted-foreground mb-1 block text-xs">
          New version
        </label>
        <Input
          id="new-version"
          type="number"
          min={1}
          value={version}
          onChange={(e) => {
            setVersion(Number(e.target.value));
          }}
          className="w-24"
        />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input
          type="checkbox"
          checked={activate}
          onChange={(e) => {
            setActivate(e.target.checked);
          }}
        />
        Activate immediately
      </label>
      <Button size="sm" disabled={saving} onClick={handleCreate}>
        {saving ? "Creating..." : "Create version"}
      </Button>
      {error && <span className="text-destructive text-xs">{error}</span>}
    </div>
  );
}
