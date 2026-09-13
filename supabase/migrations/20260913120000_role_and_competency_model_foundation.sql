-- F-01: role & competency model foundation

create type public.user_role as enum ('employee', 'competence_leader', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'employee',
  manager_id uuid not null references public.profiles (id),
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.competency_models (
  id uuid primary key default gen_random_uuid(),
  version integer not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one active model at a time; backstops the application-level toggle in the admin API.
create unique index competency_models_single_active_idx
  on public.competency_models (is_active)
  where is_active;

create table public.competencies (
  id uuid primary key default gen_random_uuid(),
  competency_model_id uuid not null references public.competency_models (id) on delete cascade,
  name text not null,
  description text,
  expected_proficiency_level smallint not null check (expected_proficiency_level between 1 and 5),
  created_at timestamptz not null default now()
);

-- Auto-provision a profile for every new auth user (role defaults to employee,
-- manager_id defaults to self until an admin reassigns it).
-- SECURITY DEFINER is required: real signups insert into auth.users as
-- supabase_auth_admin, which has no INSERT grant on public.profiles by default —
-- without it, every signup would fail (an AFTER INSERT trigger error rolls back
-- the triggering statement).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, manager_id)
  values (new.id, 'employee', new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- SECURITY DEFINER so this can be called from within a profiles RLS policy
-- without re-triggering that same policy (recursive evaluation).
create function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.competency_models enable row level security;
alter table public.competencies enable row level security;

create policy "profiles_select" on public.profiles
  for select
  using (
    id = auth.uid()
    or manager_id = auth.uid()
    or public.is_admin()
  );

create policy "profiles_update_admin_only" on public.profiles
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "competency_models_select_authenticated" on public.competency_models
  for select
  using (auth.uid() is not null);

create policy "competency_models_insert_admin_only" on public.competency_models
  for insert
  with check (public.is_admin());

create policy "competency_models_update_admin_only" on public.competency_models
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "competency_models_delete_admin_only" on public.competency_models
  for delete
  using (public.is_admin());

create policy "competencies_select_authenticated" on public.competencies
  for select
  using (auth.uid() is not null);

create policy "competencies_insert_admin_only" on public.competencies
  for insert
  with check (public.is_admin());

create policy "competencies_update_admin_only" on public.competencies
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "competencies_delete_admin_only" on public.competencies
  for delete
  using (public.is_admin());
