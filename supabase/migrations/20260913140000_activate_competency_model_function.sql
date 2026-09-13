-- Atomically activate one competency_models row and deactivate every other
-- row in a single statement, so no request can observe (or leave behind) a
-- state with zero or two active models. Admin-gated internally since this
-- runs as security definer and therefore bypasses the table's RLS policies.
create or replace function public.activate_competency_model(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  update public.competency_models
  set is_active = (id = target_id), updated_at = now()
  where is_active <> (id = target_id);
end;
$$;

grant execute on function public.activate_competency_model(uuid) to authenticated;
