-- S-03 follow-up: development_plan_gaps_insert was missing the same
-- status = 'approved' gate that development_plans_insert/_update already
-- enforce on the parent relationship — inconsistent with the sibling
-- policies' stated invariant, found during implementation review.
drop policy "development_plan_gaps_insert" on public.development_plan_gaps;

create policy "development_plan_gaps_insert" on public.development_plan_gaps
  for insert
  with check (
    exists (
      select 1 from public.development_plans dp
      join public.assessments a on a.id = dp.assessment_id
      join public.profiles p on p.id = a.employee_id
      where dp.id = development_plan_gaps.development_plan_id
        and a.status = 'approved'
        and (a.employee_id = auth.uid() or p.manager_id = auth.uid())
    )
  );
