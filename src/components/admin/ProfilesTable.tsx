import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import RoleManagerEditor from "@/components/admin/RoleManagerEditor";
import type { Profile } from "@/types";

interface Props {
  profiles: Profile[];
}

// One island for the whole table, not one per row: Astro wraps a per-row
// client:load component in an <astro-island> custom element, which browsers
// foster-part out of <tbody> (it isn't a valid direct child), breaking the
// table into a headerless interactive block plus a header-only empty table.
export default function ProfilesTable({ profiles }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Manager</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {profiles.map((profile) => (
          <RoleManagerEditor key={profile.id} profile={profile} allProfiles={profiles} />
        ))}
      </TableBody>
    </Table>
  );
}
