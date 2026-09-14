-- testing-bootstrap-critical-path-auth-integrity Phase 3: assessments_update_own_draft_only's
-- WITH CHECK only verified employee_id = auth.uid(), never the resulting
-- status — so an employee's own draft row could be updated directly to
-- status = 'approved' (with fabricated reviewed_by/reviewed_at), skipping
-- submission and leader review entirely, and the row would then be
-- permanently terminal (no other policy can revert it). This is the same
-- "WITH CHECK doesn't mirror the invariant USING/the migration comment
-- implies" bug shape already caught and fixed twice before in this
-- codebase (20260913160200_leader_review_visibility_fix.sql,
-- 20260914100000_development_plan_gaps_insert_approved_fix.sql).
drop policy "assessments_update_own_draft_only" on public.assessments;

create policy "assessments_update_own_draft_only" on public.assessments
  for update
  using (employee_id = auth.uid() and status = 'draft')
  with check (employee_id = auth.uid() and status = 'submitted');
