-- testing-bootstrap-critical-path-auth-integrity Phase 4: development_plans_select
-- and development_plan_gaps_select never checked the parent assessment's
-- status = 'approved', unlike their INSERT siblings (development_plans_insert,
-- development_plans_update, and development_plan_gaps_insert — the last of
-- which had this exact same omission caught and fixed by
-- 20260914100000_development_plan_gaps_insert_approved_fix.sql). Dormant
-- today (no policy lets assessments.status move away from 'approved' once
-- reached — see 20260914110000_assessment_status_lock_fix.sql), but fixed
-- defensively so a future "unapprove"/reopen transition can't silently
-- start leaking plans for non-approved assessments via direct table access.
drop policy "development_plans_select" on public.development_plans;

create policy "development_plans_select" on public.development_plans
  for select
  using (
    exists (
      select 1 from public.assessments a
      join public.profiles p on p.id = a.employee_id
      where a.id = development_plans.assessment_id
        and a.status = 'approved'
        and (a.employee_id = auth.uid() or p.manager_id = auth.uid())
    )
  );

drop policy "development_plan_gaps_select" on public.development_plan_gaps;

create policy "development_plan_gaps_select" on public.development_plan_gaps
  for select
  using (
    exists (
      select 1 from public.development_plans dp
      join public.assessments a on a.id = dp.assessment_id
      join public.profiles p on p.id = a.employee_id
      where dp.id = development_plan_gaps.development_plan_id
        and a.status = 'approved'
        and (a.employee_id = auth.uid() or p.manager_id = auth.uid())
    )
  );
