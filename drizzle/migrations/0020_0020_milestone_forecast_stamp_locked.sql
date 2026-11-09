create or replace function public.guard_project_milestone()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_today date;
begin
  select (now() at time zone coalesce(t.timezone, 'Europe/London'))::date into v_today from public.tenants t where t.id = new.tenant_id;
  if tg_op = 'UPDATE' then
    if new.tenant_id <> old.tenant_id or new.project_id <> old.project_id then
      raise exception 'IMMUTABLE: milestone project never changes' using errcode = 'P0001';
    end if;
    if new.baseline_date is distinct from old.baseline_date and coalesce(current_setting('app.milestone_rebaseline', true), '') <> new.id::text then
      raise exception 'BASELINE_LOCKED: use Re-baseline to change a baseline so the earlier one is kept' using errcode = 'P0001';
    end if;
    -- The forecast-updated date is set only by the database, so a stale forecast cannot be hidden.
    new.forecast_updated_on := case when new.forecast_date is distinct from old.forecast_date then v_today else old.forecast_updated_on end;
  else
    new.forecast_updated_on := case when new.forecast_date is not null then v_today end;
  end if;
  if new.actual_date is not null and new.actual_date > v_today then
    raise exception 'ACTUAL_IN_FUTURE: an actual date cannot be later than today' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.guard_project_milestone() from public, anon, authenticated;