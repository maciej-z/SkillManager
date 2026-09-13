-- S-02 follow-up: assessments_select_leader's original USING clause
-- (`status <> 'draft'`) meant a leader lost all visibility into an
-- assessment the instant they returned it to draft — and Postgres rejects
-- an UPDATE whose resulting row would become invisible under every
-- applicable policy, even when the UPDATE policy's own WITH CHECK passes.
-- Extending visibility to rows the leader has reviewed (regardless of
-- current status) fixes the write and gives the leader a lasting record of
-- what they've reviewed.
drop policy "assessments_select_leader" on public.assessments;

create policy "assessments_select_leader" on public.assessments
  for select
  using (
    (status <> 'draft' or reviewed_by = auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = assessments.employee_id
        and p.manager_id = auth.uid()
    )
  );
