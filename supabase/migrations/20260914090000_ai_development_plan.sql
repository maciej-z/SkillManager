-- S-03: AI development plan

create type public.development_plan_status as enum ('pending', 'ready', 'failed');

create table public.development_plans (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  status public.development_plan_status not null default 'pending',
  raw_response text,
  error_message text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id)
);

create table public.development_plan_gaps (
  id uuid primary key default gen_random_uuid(),
  development_plan_id uuid not null references public.development_plans (id) on delete cascade,
  competency_id uuid not null references public.competencies (id),
  gap_size smallint not null check (gap_size > 0),
  rank smallint not null,
  recommended_actions jsonb,
  created_at timestamptz not null default now(),
  unique (development_plan_id, competency_id)
);

alter table public.development_plans enable row level security;
alter table public.development_plan_gaps enable row level security;

-- Visible to the employee the parent assessment belongs to, or that
-- employee's manager — same employee-or-manager shape as
-- assessments_select_own/assessments_select_leader, combined into one
-- policy since a development plan has no draft-visibility gate to split on.
create policy "development_plans_select" on public.development_plans
  for select
  using (
    exists (
      select 1 from public.assessments a
      join public.profiles p on p.id = a.employee_id
      where a.id = development_plans.assessment_id
        and (a.employee_id = auth.uid() or p.manager_id = auth.uid())
    )
  );

-- Generation can only be claimed (INSERT) or updated once the parent
-- assessment is approved — the generate route's insert-with-conflict-skip
-- race guard (unique(assessment_id) above) relies on this gate too.
create policy "development_plans_insert" on public.development_plans
  for insert
  with check (
    exists (
      select 1 from public.assessments a
      join public.profiles p on p.id = a.employee_id
      where a.id = development_plans.assessment_id
        and a.status = 'approved'
        and (a.employee_id = auth.uid() or p.manager_id = auth.uid())
    )
  );

create policy "development_plans_update" on public.development_plans
  for update
  using (
    exists (
      select 1 from public.assessments a
      join public.profiles p on p.id = a.employee_id
      where a.id = development_plans.assessment_id
        and a.status = 'approved'
        and (a.employee_id = auth.uid() or p.manager_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.assessments a
      join public.profiles p on p.id = a.employee_id
      where a.id = development_plans.assessment_id
        and a.status = 'approved'
        and (a.employee_id = auth.uid() or p.manager_id = auth.uid())
    )
  );

create policy "development_plan_gaps_select" on public.development_plan_gaps
  for select
  using (
    exists (
      select 1 from public.development_plans dp
      join public.assessments a on a.id = dp.assessment_id
      join public.profiles p on p.id = a.employee_id
      where dp.id = development_plan_gaps.development_plan_id
        and (a.employee_id = auth.uid() or p.manager_id = auth.uid())
    )
  );

create policy "development_plan_gaps_insert" on public.development_plan_gaps
  for insert
  with check (
    exists (
      select 1 from public.development_plans dp
      join public.assessments a on a.id = dp.assessment_id
      join public.profiles p on p.id = a.employee_id
      where dp.id = development_plan_gaps.development_plan_id
        and (a.employee_id = auth.uid() or p.manager_id = auth.uid())
    )
  );

-- No DELETE policy on either table: plans are stable once created.
