-- S-02: leader review and approval

alter table public.assessments
  add column leader_comment text,
  add column reviewed_by uuid references public.profiles (id),
  add column reviewed_at timestamptz;

alter table public.assessment_scores
  add column leader_comment text;

-- Leaders can see their direct reports' non-draft assessments. `status <>
-- 'draft'` keeps an in-progress self-assessment invisible to the leader
-- until the employee actually submits it (FR-008).
create policy "assessments_select_leader" on public.assessments
  for select
  using (
    status <> 'draft'
    and exists (
      select 1 from public.profiles p
      where p.id = assessments.employee_id
        and p.manager_id = auth.uid()
    )
  );

-- USING checks the row as it exists BEFORE the update: requiring status =
-- 'submitted' here is what makes the leader's first approve-or-return
-- transition succeed (existing row is still submitted) while rejecting
-- every subsequent attempt (existing row is now approved, or back to
-- draft) — the same lock shape as assessments_update_own_draft_only from
-- S-01, gated on the leader relationship instead of employee ownership.
create policy "assessments_update_leader_review" on public.assessments
  for update
  using (
    status = 'submitted'
    and exists (
      select 1 from public.profiles p
      where p.id = assessments.employee_id
        and p.manager_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = assessments.employee_id
        and p.manager_id = auth.uid()
    )
  );

create policy "assessment_scores_select_leader" on public.assessment_scores
  for select
  using (
    exists (
      select 1 from public.assessments a
      join public.profiles p on p.id = a.employee_id
      where a.id = assessment_scores.assessment_id
        and a.status <> 'draft'
        and p.manager_id = auth.uid()
    )
  );

-- Note: this policy authorizes the whole row, not just leader_comment — RLS
-- has no column-level granularity. The API routes are what prevent a
-- leader's update from touching `score`/`comment` (the employee's fields),
-- by only ever sending { leader_comment } in the update payload.
create policy "assessment_scores_update_leader_review" on public.assessment_scores
  for update
  using (
    exists (
      select 1 from public.assessments a
      join public.profiles p on p.id = a.employee_id
      where a.id = assessment_scores.assessment_id
        and a.status = 'submitted'
        and p.manager_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.assessments a
      join public.profiles p on p.id = a.employee_id
      where a.id = assessment_scores.assessment_id
        and p.manager_id = auth.uid()
    )
  );
