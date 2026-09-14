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

-- S-04 manual-test fixtures: extra leaders/employees exercising every
-- /dashboard state for a Competence Leader, without needing manual Studio
-- setup. All report up through Senior Leader, alongside the existing
-- Junior Leader. Alice/Bob above are left untouched so /assessment and
-- /reviews keep their existing draft/submitted zero-setup coverage.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999991', 'authenticated', 'authenticated', 'leader.dana@skillmanager.test', extensions.crypt('pilot-password', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999992', 'authenticated', 'authenticated', 'leader.gina@skillmanager.test', extensions.crypt('pilot-password', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999993', 'authenticated', 'authenticated', 'leader.iris@skillmanager.test', extensions.crypt('pilot-password', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999994', 'authenticated', 'authenticated', 'employee.frank@skillmanager.test', extensions.crypt('pilot-password', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999995', 'authenticated', 'authenticated', 'employee.grace@skillmanager.test', extensions.crypt('pilot-password', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999996', 'authenticated', 'authenticated', 'employee.henry@skillmanager.test', extensions.crypt('pilot-password', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '')
on conflict (id) do nothing;

insert into public.profiles (id, role, manager_id, full_name) values
  ('99999999-9999-9999-9999-999999999991', 'competence_leader', '22222222-2222-2222-2222-222222222222', 'Leader Dana'),
  ('99999999-9999-9999-9999-999999999992', 'competence_leader', '22222222-2222-2222-2222-222222222222', 'Leader Gina'),
  ('99999999-9999-9999-9999-999999999993', 'competence_leader', '22222222-2222-2222-2222-222222222222', 'Leader Iris'),
  ('99999999-9999-9999-9999-999999999994', 'employee', '99999999-9999-9999-9999-999999999991', 'Employee Frank'),
  ('99999999-9999-9999-9999-999999999995', 'employee', '99999999-9999-9999-9999-999999999991', 'Employee Grace'),
  ('99999999-9999-9999-9999-999999999996', 'employee', '99999999-9999-9999-9999-999999999992', 'Employee Henry')
on conflict (id) do update set
  role = excluded.role,
  manager_id = excluded.manager_id,
  full_name = excluded.full_name;

-- Frank + Grace (report to Dana) both have approved assessments with real,
-- overlapping gaps — Dana's /dashboard exercises the ranked-list state,
-- including the count>1 case (Technical Craft, shared by both) and the
-- tie-break-irrelevant single-report case (Mentoring, Frank only). Henry
-- (reports to Gina) meets or exceeds every competency — Gina's /dashboard
-- exercises the "team meets expectations" empty state. Iris has zero
-- direct reports — exercises the "no direct reports" empty state. Senior
-- Leader's existing report (Junior Leader, who never self-assesses)
-- already exercises the "no approved assessments yet" empty state.
insert into public.assessments (id, employee_id, competency_model_id, status, submitted_at, reviewed_by, reviewed_at) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '99999999-9999-9999-9999-999999999994', '66666666-6666-6666-6666-666666666666', 'approved', now(), '99999999-9999-9999-9999-999999999991', now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '99999999-9999-9999-9999-999999999995', '66666666-6666-6666-6666-666666666666', 'approved', now(), '99999999-9999-9999-9999-999999999991', now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', '99999999-9999-9999-9999-999999999996', '66666666-6666-6666-6666-666666666666', 'approved', now(), '99999999-9999-9999-9999-999999999992', now());

insert into public.assessment_scores (assessment_id, competency_id, score) values
  -- Frank: gaps in Technical Craft (3 < 4) and Mentoring (1 < 2)
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '77777777-7777-7777-7777-777777777771', 3),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '77777777-7777-7777-7777-777777777772', 4),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '77777777-7777-7777-7777-777777777773', 3),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '77777777-7777-7777-7777-777777777774', 3),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '77777777-7777-7777-7777-777777777775', 3),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '77777777-7777-7777-7777-777777777776', 1),
  -- Grace: gap in Technical Craft only (2 < 4)
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '77777777-7777-7777-7777-777777777771', 4),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '77777777-7777-7777-7777-777777777772', 4),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '77777777-7777-7777-7777-777777777773', 2),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '77777777-7777-7777-7777-777777777774', 3),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '77777777-7777-7777-7777-777777777775', 4),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '77777777-7777-7777-7777-777777777776', 2),
  -- Henry: meets or exceeds every competency, zero gaps
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', '77777777-7777-7777-7777-777777777771', 3),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', '77777777-7777-7777-7777-777777777772', 4),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', '77777777-7777-7777-7777-777777777773', 4),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', '77777777-7777-7777-7777-777777777774', 4),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', '77777777-7777-7777-7777-777777777775', 3),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', '77777777-7777-7777-7777-777777777776', 3);

-- testing-bootstrap-critical-path-auth-integrity Phase 2: a third Junior
-- Leader report (Employee Chris) whose assessment was submitted and then
-- returned for correction — the one assessment-lifecycle state no earlier
-- seed exercised. Matches exactly what return.ts's update payload produces
-- (src/pages/api/reviews/[id]/return.ts:94-101): status flips back to
-- 'draft', submitted_at is preserved (not cleared), leader_comment and
-- reviewed_by/reviewed_at are set. Scores keep their original values (only
-- their leader_comment changes) since return.ts never touches score itself.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'authenticated', 'authenticated', 'employee.chris@skillmanager.test', extensions.crypt('pilot-password', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '')
on conflict (id) do nothing;

insert into public.profiles (id, role, manager_id, full_name) values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'employee', '33333333-3333-3333-3333-333333333333', 'Employee Chris')
on conflict (id) do update set
  role = excluded.role,
  manager_id = excluded.manager_id,
  full_name = excluded.full_name;

insert into public.assessments (id, employee_id, competency_model_id, status, submitted_at, leader_comment, reviewed_by, reviewed_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', '66666666-6666-6666-6666-666666666666', 'draft', now(), 'A few scores need another look before I can approve this — see the Mentoring comment.', '33333333-3333-3333-3333-333333333333', now());

insert into public.assessment_scores (assessment_id, competency_id, score, comment, leader_comment) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '77777777-7777-7777-7777-777777777771', 3, null, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '77777777-7777-7777-7777-777777777772', 4, null, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '77777777-7777-7777-7777-777777777773', 3, null, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '77777777-7777-7777-7777-777777777774', 4, null, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '77777777-7777-7777-7777-777777777775', 3, null, null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '77777777-7777-7777-7777-777777777776', 2, null, 'This reads more like a self-rating than what I saw in practice — can we revisit with a concrete example?');
