import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import type { Competency } from "@/types";

interface Props {
  competency: Competency;
}

export default function CompetencyRowEditor({ competency }: Props) {
  const [name, setName] = useState(competency.name);
  const [description, setDescription] = useState(competency.description ?? "");
  const [level, setLevel] = useState(competency.expected_proficiency_level);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name !== competency.name ||
    description !== (competency.description ?? "") ||
    level !== competency.expected_proficiency_level;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/competencies/${competency.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, expected_proficiency_level: level }),
    });
    setSaving(false);
    if (res.ok) {
      window.location.reload();
    } else {
      setError("Failed to save");
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete competency "${competency.name}"?`)) {
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/competencies/${competency.id}`, { method: "DELETE" });
    setSaving(false);
    if (res.ok) {
      window.location.reload();
    } else {
      setError("Failed to delete");
    }
  }

  return (
    <TableRow>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          className="min-w-32"
        />
      </TableCell>
      <TableCell>
        <Input
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          className="min-w-48"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={1}
          max={5}
          value={level}
          onChange={(e) => {
            setLevel(Number(e.target.value));
          }}
          className="w-16"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!dirty || saving} onClick={handleSave}>
            Save
          </Button>
          <Button size="sm" variant="destructive" disabled={saving} onClick={handleDelete}>
            Delete
          </Button>
          {error && <span className="text-destructive text-xs">{error}</span>}
        </div>
      </TableCell>
    </TableRow>
  );
}
