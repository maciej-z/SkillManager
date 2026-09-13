import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import type { CompetencyModel } from "@/types";

interface Props {
  model: CompetencyModel;
}

export default function CompetencyModelRowActions({ model }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/competency-models/${model.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    setBusy(false);
    if (res.ok) {
      window.location.reload();
    } else {
      setError("Failed to activate");
    }
  }

  async function remove() {
    if (!window.confirm(`Delete competency model v${model.version}? This also deletes its competencies.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/competency-models/${model.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      window.location.reload();
    } else {
      setError("Failed to delete");
    }
  }

  return (
    <TableRow>
      <TableCell>v{model.version}</TableCell>
      <TableCell>{model.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {!model.is_active && (
            <Button size="sm" variant="outline" disabled={busy} onClick={activate}>
              Activate
            </Button>
          )}
          <Button size="sm" variant="destructive" disabled={busy} onClick={remove}>
            Delete
          </Button>
          {error && <span className="text-destructive text-xs">{error}</span>}
        </div>
      </TableCell>
    </TableRow>
  );
}
