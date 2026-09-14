import { OPENROUTER_API_KEY } from "astro:env/server";
import type { Competency } from "@/types";

interface GapInput {
  competency: Competency;
  score: number;
}

interface GenerationResult {
  raw: string;
  actionsByCompetencyId: Record<string, string[]>;
}

const STUB_ACTIONS = [
  "Pair with a colleague who is strong in this area on a real task.",
  "Seek out a stretch assignment that exercises this competency directly.",
  "Ask your manager for targeted feedback on this competency next cycle.",
];

function buildPrompt(gaps: GapInput[], allScores: GapInput[]): string {
  const gapLines = gaps
    .map(
      ({ competency, score }, index) =>
        `${index + 1}. ${competency.name}: ${competency.description ?? "no description"} (expected level ${competency.expected_proficiency_level}, actual score ${score})`,
    )
    .join("\n");
  const contextLines = allScores
    .map(
      ({ competency, score }) =>
        `- ${competency.name}: expected ${competency.expected_proficiency_level}, actual ${score}`,
    )
    .join("\n");

  return `You are helping build a development plan for an employee based on their approved competency assessment.

Identified gaps (competencies where the actual score is below the expected level), ranked largest to smallest:
${gapLines}

Full set of the employee's competency scores, for context:
${contextLines}

For each identified gap listed above, recommend 2-3 concrete, actionable steps the employee could take to close that specific gap. Ground every recommendation in the gap's competency name and description — do not give generic career advice unrelated to these competencies.

Respond with ONLY a JSON object of the shape { "gaps": [ { "actions": string[] } ] }, with exactly ${gaps.length} entries — the first entry must correspond to gap 1 above, the second to gap 2, and so on in the exact same order. Do not reorder, skip, or merge entries.`;
}

export async function generateDevelopmentPlanActions(
  gaps: GapInput[],
  allScores: GapInput[],
): Promise<GenerationResult> {
  if (!OPENROUTER_API_KEY) {
    const actionsByCompetencyId = Object.fromEntries(gaps.map(({ competency }) => [competency.id, STUB_ACTIONS]));
    return {
      raw: "stub: OPENROUTER_API_KEY not configured, returning canned actions",
      actionsByCompetencyId,
    };
  }

  const prompt = buildPrompt(gaps, allScores);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed with status ${response.status}`);
  }

  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = body.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenRouter response contained no message content");
  }

  let parsed: { gaps?: { actions?: string[] }[] };
  try {
    parsed = JSON.parse(raw) as { gaps?: { actions?: string[] }[] };
  } catch {
    throw new Error("OpenRouter response was not valid JSON");
  }

  // Matched by array position, not by an id the model echoes back — a
  // hallucinated or reworded id would silently break the lookup (observed:
  // the model returned the competency's name in place of the uuid we never
  // actually gave it). Position is exactly what buildPrompt asks the model
  // to preserve, and requires no fuzzy extraction to trust.
  if (!Array.isArray(parsed.gaps) || parsed.gaps.length !== gaps.length) {
    throw new Error("OpenRouter response did not contain one gap entry per requested gap");
  }

  const actionsByCompetencyId: Record<string, string[]> = {};
  parsed.gaps.forEach((entry, index) => {
    if (!Array.isArray(entry.actions) || entry.actions.length === 0) {
      throw new Error("OpenRouter response contained a malformed gap entry");
    }
    actionsByCompetencyId[gaps[index].competency.id] = entry.actions;
  });

  return { raw, actionsByCompetencyId };
}
