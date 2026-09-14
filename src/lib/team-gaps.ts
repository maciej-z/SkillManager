import type { Competency } from "@/types";

export interface TeamGapRankingEntry {
  competency: Competency;
  count: number;
  employees: { id: string; full_name: string | null }[];
}

interface ScoreEntry {
  employee: { id: string; full_name: string | null };
  competency: Competency;
  score: number;
}

export function computeTeamGapRanking(scores: ScoreEntry[]): TeamGapRankingEntry[] {
  const entriesByCompetencyId = new Map<string, TeamGapRankingEntry>();

  for (const { employee, competency, score } of scores) {
    if (score >= competency.expected_proficiency_level) {
      continue;
    }
    const entry = entriesByCompetencyId.get(competency.id);
    if (entry) {
      entry.count += 1;
      entry.employees.push(employee);
    } else {
      entriesByCompetencyId.set(competency.id, { competency, count: 1, employees: [employee] });
    }
  }

  return Array.from(entriesByCompetencyId.values()).sort((a, b) => {
    if (a.count !== b.count) {
      return b.count - a.count;
    }
    return a.competency.name.localeCompare(b.competency.name);
  });
}
