-- S-01: employee self-assessment

create type public.assessment_status as enum ('draft', 'submitted');

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  competency_model_id uuid not null references public.competency_models (id),
  status public.assessment_status not null default 'draft',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, competency_model_id)
);

create table public.assessment_scores (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  competency_id uuid not null references public.competencies (id),
  score smallint not null check (score between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, competency_id)
);

alter table public.assessments enable row level security;
alter table public.assessment_scores enable row level security;

create policy "assessments_select_own" on public.assessments
  for select
  using (employee_id = auth.uid());

create policy "assessments_insert_own" on public.assessments
  for insert
  with check (employee_id = auth.uid());

-- USING checks the row as it exists BEFORE the update: requiring status =
-- 'draft' here is what makes the draft -> submitted transition itself
-- succeed (existing row is still draft) while rejecting every subsequent
-- UPDATE attempt (existing row is now submitted) — the lock is enforced at
-- the database layer, not just by a disabled button in the UI.
create policy "assessments_update_own_draft_only" on public.assessments
  for update
  using (employee_id = auth.uid() and status = 'draft')
  with check (employee_id = auth.uid());

create policy "assessment_scores_select_own" on public.assessment_scores
  for select
  using (
    exists (
      select 1 from public.assessments a
      where a.id = assessment_scores.assessment_id
        and a.employee_id = auth.uid()
    )
  );

create policy "assessment_scores_insert_own_draft_only" on public.assessment_scores
  for insert
  with check (
    exists (
      select 1 from public.assessments a
      where a.id = assessment_scores.assessment_id
        and a.employee_id = auth.uid()
        and a.status = 'draft'
    )
  );

create policy "assessment_scores_update_own_draft_only" on public.assessment_scores
  for update
  using (
    exists (
      select 1 from public.assessments a
      where a.id = assessment_scores.assessment_id
        and a.employee_id = auth.uid()
        and a.status = 'draft'
    )
  )
  with check (
    exists (
      select 1 from public.assessments a
      where a.id = assessment_scores.assessment_id
        and a.employee_id = auth.uid()
    )
  );
