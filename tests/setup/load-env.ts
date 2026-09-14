// Loads local Supabase credentials for test runs. `.dev.vars` won't exist in
// CI — the test job sets SUPABASE_URL/SUPABASE_KEY directly from
// `supabase start`'s output instead, so a missing file here is expected.
try {
  process.loadEnvFile(".dev.vars");
} catch {
  // absent — env already set by the job (CI) or the developer's shell
}
