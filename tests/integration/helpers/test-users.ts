// Mirrors the pilot accounts seeded by supabase/seed.sql. Keep in sync with
// that file — this is the one place test files should reference seeded
// users, instead of scattering emails/UUIDs across test files.

export const PILOT_PASSWORD = "pilot-password";

export const TEST_USERS = {
  admin: { email: "admin@skillmanager.test", id: "11111111-1111-1111-1111-111111111111" },
  seniorLeader: { email: "leader.senior@skillmanager.test", id: "22222222-2222-2222-2222-222222222222" },
  juniorLeader: { email: "leader.junior@skillmanager.test", id: "33333333-3333-3333-3333-333333333333" },
  employeeAlice: { email: "employee.alice@skillmanager.test", id: "44444444-4444-4444-4444-444444444444" },
  employeeBob: { email: "employee.bob@skillmanager.test", id: "55555555-5555-5555-5555-555555555555" },
  leaderDana: { email: "leader.dana@skillmanager.test", id: "99999999-9999-9999-9999-999999999991" },
  leaderGina: { email: "leader.gina@skillmanager.test", id: "99999999-9999-9999-9999-999999999992" },
  leaderIris: { email: "leader.iris@skillmanager.test", id: "99999999-9999-9999-9999-999999999993" },
  employeeFrank: { email: "employee.frank@skillmanager.test", id: "99999999-9999-9999-9999-999999999994" },
  employeeGrace: { email: "employee.grace@skillmanager.test", id: "99999999-9999-9999-9999-999999999995" },
  employeeHenry: { email: "employee.henry@skillmanager.test", id: "99999999-9999-9999-9999-999999999996" },
} as const;

// Seeded assessment ids (supabase/seed.sql), referenced directly by tests
// that need to act on a specific assessment rather than looking one up.
export const TEST_ASSESSMENTS = {
  aliceDraft: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
  bobSubmitted: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
  frankApproved: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
  graceApproved: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2",
  henryApproved: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3",
} as const;
