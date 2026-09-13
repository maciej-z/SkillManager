import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import CompetencyRowEditor from "@/components/admin/CompetencyRowEditor";
import type { Competency } from "@/types";

interface Props {
  competencies: Competency[];
}

// One island for the whole table — see ProfilesTable.tsx for why per-row
// islands break inside a <table>.
export default function CompetenciesTable({ competencies }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Level</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {competencies.map((competency) => (
          <CompetencyRowEditor key={competency.id} competency={competency} />
        ))}
      </TableBody>
    </Table>
  );
}
