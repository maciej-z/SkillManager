import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Profile, UserRole } from "@/types";

interface Props {
  profile: Profile;
  allProfiles: Profile[];
}

const ROLE_LABELS: Record<UserRole, string> = {
  employee: "Employee",
  competence_leader: "Competence Leader",
  admin: "Admin",
};

export default function RoleManagerEditor({ profile, allProfiles }: Props) {
  const [role, setRole] = useState<UserRole>(profile.role);
  const [managerId, setManagerId] = useState(profile.manager_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = role !== profile.role || managerId !== profile.manager_id;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/profiles/${profile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, manager_id: managerId }),
    });
    setSaving(false);
    if (res.ok) {
      window.location.reload();
    } else {
      setError("Failed to save changes");
    }
  }

  return (
    <TableRow>
      <TableCell>{profile.full_name ?? profile.id}</TableCell>
      <TableCell>
        <Select
          value={role}
          onValueChange={(value) => {
            setRole(value as UserRole);
          }}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select value={managerId} onValueChange={setManagerId}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allProfiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.full_name ?? p.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!dirty || saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save"}
          </Button>
          {error && <span className="text-destructive text-xs">{error}</span>}
        </div>
      </TableCell>
    </TableRow>
  );
}
