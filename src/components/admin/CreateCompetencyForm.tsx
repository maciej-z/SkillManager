import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  competencyModelId: string;
}

export default function CreateCompetencyForm({ competencyModelId }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState(3);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/competencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        competency_model_id: competencyModelId,
        name,
        description: description || undefined,
        expected_proficiency_level: level,
      }),
    });
    setSaving(false);
    if (res.ok) {
      window.location.reload();
    } else {
      setError("Failed to create competency");
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
      <div>
        <label htmlFor="new-comp-name" className="text-muted-foreground mb-1 block text-xs">
          Name
        </label>
        <Input
          id="new-comp-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          className="w-40"
        />
      </div>
      <div>
        <label htmlFor="new-comp-desc" className="text-muted-foreground mb-1 block text-xs">
          Description
        </label>
        <Input
          id="new-comp-desc"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          className="w-56"
        />
      </div>
      <div>
        <label htmlFor="new-comp-level" className="text-muted-foreground mb-1 block text-xs">
          Expected level (1-5)
        </label>
        <Input
          id="new-comp-level"
          type="number"
          min={1}
          max={5}
          value={level}
          onChange={(e) => {
            setLevel(Number(e.target.value));
          }}
          className="w-20"
        />
      </div>
      <Button size="sm" disabled={saving} onClick={handleCreate}>
        {saving ? "Adding..." : "Add competency"}
      </Button>
      {error && <span className="text-destructive text-xs">{error}</span>}
    </div>
  );
}
