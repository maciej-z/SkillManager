-- Pilot seed data for local/dev only. Never run against a shared environment.
-- Reset path: `npx supabase db reset` (re-applies migrations + this file from scratch).

create extension if not exists pgcrypto with schema extensions;

-- Pilot auth accounts. All share the password 'pilot-password' (local dev only).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'admin@skillmanager.test', extensions.crypt('pilot-password', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'leader.senior@skillmanager.test', extensions.crypt('pilot-password', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'leader.junior@skillmanager.test', extensions.crypt('pilot-password', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'employee.alice@skillmanager.test', extensions.crypt('pilot-password', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'employee.bob@skillmanager.test', extensions.crypt('pilot-password', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '')
on conflict (id) do nothing;

-- The on_auth_user_created trigger already auto-created a profiles row for each
-- insert above (role='employee', manager_id=self) — upsert the real pilot
-- hierarchy over it. Senior leader is a hierarchy root (self-references);
-- junior leader reports to senior; both employees report to junior leader.
insert into public.profiles (id, role, manager_id, full_name) values
  ('11111111-1111-1111-1111-111111111111', 'admin', '11111111-1111-1111-1111-111111111111', 'Pilot Admin'),
  ('22222222-2222-2222-2222-222222222222', 'competence_leader', '22222222-2222-2222-2222-222222222222', 'Senior Leader'),
  ('33333333-3333-3333-3333-333333333333', 'competence_leader', '22222222-2222-2222-2222-222222222222', 'Junior Leader'),
  ('44444444-4444-4444-4444-444444444444', 'employee', '33333333-3333-3333-3333-333333333333', 'Employee Alice'),
  ('55555555-5555-5555-5555-555555555555', 'employee', '33333333-3333-3333-3333-333333333333', 'Employee Bob')
on conflict (id) do update set
  role = excluded.role,
  manager_id = excluded.manager_id,
  full_name = excluded.full_name;

-- One active competency model with a pilot competency set.
insert into public.competency_models (id, version, is_active) values
  ('66666666-6666-6666-6666-666666666666', 1, true);

-- Explicit ids so the assessment/score seed rows below can reference them directly.
insert into public.competencies (id, competency_model_id, name, description, expected_proficiency_level) values
  ('77777777-7777-7777-7777-777777777771', '66666666-6666-6666-6666-666666666666', 'Communication', 'Clearly conveys ideas and listens actively', 3),
  ('77777777-7777-7777-7777-777777777772', '66666666-6666-6666-6666-666666666666', 'Problem Solving', 'Breaks down and resolves complex problems', 4),
  ('77777777-7777-7777-7777-777777777773', '66666666-6666-6666-6666-666666666666', 'Technical Craft', 'Depth and quality of technical execution', 4),
  ('77777777-7777-7777-7777-777777777774', '66666666-6666-6666-6666-666666666666', 'Collaboration', 'Works effectively across teams', 3),
  ('77777777-7777-7777-7777-777777777775', '66666666-6666-6666-6666-666666666666', 'Ownership', 'Takes responsibility for outcomes end-to-end', 3),
  ('77777777-7777-7777-7777-777777777776', '66666666-6666-6666-6666-666666666666', 'Mentoring', 'Grows the skills of people around them', 2);

-- S-01 pilot assessments: Alice is mid-draft (2 of 6 scored), Bob has already
-- submitted a complete one — exercises all three /assessment page states
-- (none for the two leaders/admin who never self-assess in this pilot, draft
-- for Alice, submitted/locked for Bob) without requiring manual setup.
insert into public.assessments (id, employee_id, competency_model_id, status, submitted_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '44444444-4444-4444-4444-444444444444', '66666666-6666-6666-6666-666666666666', 'draft', null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666', 'submitted', now());

insert into public.assessment_scores (assessment_id, competency_id, score, comment) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '77777777-7777-7777-7777-777777777771', 3, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '77777777-7777-7777-7777-777777777772', 3, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '77777777-7777-7777-7777-777777777771', 3, 'Comfortable presenting to the team'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '77777777-7777-7777-7777-777777777772', 4, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '77777777-7777-7777-7777-777777777773', 3, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '77777777-7777-7777-7777-777777777774', 4, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '77777777-7777-7777-7777-777777777775', 3, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '77777777-7777-7777-7777-777777777776', 2, 'Still building confidence here');
