import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import CompetencyModelRowActions from "@/components/admin/CompetencyModelRowActions";
import type { CompetencyModel } from "@/types";

interface Props {
  models: CompetencyModel[];
}

// One island for the whole table — see ProfilesTable.tsx for why per-row
// islands break inside a <table>.
export default function CompetencyModelsTable({ models }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Version</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {models.map((model) => (
          <CompetencyModelRowActions key={model.id} model={model} />
        ))}
      </TableBody>
    </Table>
  );
}
