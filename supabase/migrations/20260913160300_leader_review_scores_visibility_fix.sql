-- S-02 follow-up: assessment_scores_select_leader was left on the original
-- status<>'draft'-only gate when 20260913160200 broadened the sibling
-- assessments_select_leader policy — a leader who returns an assessment for
-- correction loses visibility into the per-competency comments they just
-- wrote, even though they retain visibility into the parent assessment row.
-- Mirrors the assessments-table fix exactly: also match when the parent
-- assessment's reviewed_by is this leader, regardless of current status.
drop policy "assessment_scores_select_leader" on public.assessment_scores;

create policy "assessment_scores_select_leader" on public.assessment_scores
  for select
  using (
    exists (
      select 1 from public.assessments a
      join public.profiles p on p.id = a.employee_id
      where a.id = assessment_scores.assessment_id
        and (a.status <> 'draft' or a.reviewed_by = auth.uid())
        and p.manager_id = auth.uid()
    )
  );
