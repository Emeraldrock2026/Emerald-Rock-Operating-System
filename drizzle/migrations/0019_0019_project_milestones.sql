-- Milestones belong to the Programmes project module. Baselines are only changed through set_milestone_baseline() and every baseline is kept in milestone_baselines.
create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 200),
  baseline_date date,
  forecast_date date,
  actual_date date,
  forecast_updated_on date,
  notes text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1,
  foreign key (tenant_id, project_id) references public.projects (tenant_id, id) on delete restrict,
  unique (tenant_id, id)
);
create index project_milestones_project_idx on public.project_milestones (project_id, sort_order);
grant select, insert, update on public.project_milestones to authenticated;
grant all on public.project_milestones to service_role;

create table public.milestone_baselines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  milestone_id uuid not null,
  baseline_no integer not null,
  baseline_date date not null,
  previous_date date,
  reason text not null check (length(trim(reason)) between 1 and 500),
  set_at timestamptz not null default now(),
  set_by uuid,
  foreign key (tenant_id, milestone_id) references public.project_milestones (tenant_id, id) on delete restrict,
  unique (milestone_id, baseline_no)
);
grant select on public.milestone_baselines to authenticated;
grant all on public.milestone_baselines to service_role;

create or replace function public.prevent_baseline_history_change()
returns trigger language plpgsql as $$
begin raise exception 'IMMUTABLE: baseline history cannot be changed' using errcode = 'P0001'; end $$;
create trigger milestone_baselines_append_only before update or delete on public.milestone_baselines for each row execute function public.prevent_baseline_history_change();

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
    if new.forecast_date is distinct from old.forecast_date then new.forecast_updated_on := v_today; end if;
  else
    new.forecast_updated_on := case when new.forecast_date is not null then v_today end;
  end if;
  if new.actual_date is not null and new.actual_date > v_today then
    raise exception 'ACTUAL_IN_FUTURE: an actual date cannot be later than today' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger project_milestones_guard before insert or update on public.project_milestones for each row execute function public.guard_project_milestone();
create trigger project_milestones_stamp_insert before insert on public.project_milestones for each row execute function public.stamp_insert();
create trigger project_milestones_stamp_update before update on public.project_milestones for each row execute function public.stamp_update();

-- The first baseline given on creation is recorded as baseline 1.
create or replace function public.record_initial_baseline()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.baseline_date is not null then
    insert into public.milestone_baselines (tenant_id, milestone_id, baseline_no, baseline_date, previous_date, reason, set_by)
    values (new.tenant_id, new.id, 1, new.baseline_date, null, 'Initial baseline', auth.uid());
  end if;
  return null;
end $$;
create trigger project_milestones_initial_baseline after insert on public.project_milestones for each row execute function public.record_initial_baseline();

alter table public.project_milestones enable row level security;
alter table public.milestone_baselines enable row level security;
create policy "Project viewers see milestones while Programmes is on; admins see historic"
  on public.project_milestones for select to authenticated using (
    public.can_view_project(tenant_id, project_id) and (
      public.project_module_active(tenant_id, project_id, 'programmes') or public.can_manage_project(tenant_id, project_id)));
create policy "Project admins add milestones"
  on public.project_milestones for insert to authenticated with check (
    public.can_manage_project(tenant_id, project_id) and public.project_module_active(tenant_id, project_id, 'programmes'));
create policy "Contributors update forecast and actual dates"
  on public.project_milestones for update to authenticated
  using (public.can_contribute_project(tenant_id, project_id) and public.project_module_active(tenant_id, project_id, 'programmes'))
  with check (public.can_contribute_project(tenant_id, project_id) and public.project_module_active(tenant_id, project_id, 'programmes'));
create policy "Baseline history follows milestone visibility"
  on public.milestone_baselines for select to authenticated using (
    exists (select 1 from public.project_milestones m where m.tenant_id = milestone_baselines.tenant_id and m.id = milestone_baselines.milestone_id));

create or replace function public.set_milestone_baseline(_milestone uuid, _date date, _reason text, _expected_version integer)
returns integer language plpgsql security definer set search_path = public as $$
declare m public.project_milestones; v_no integer;
begin
  select * into m from public.project_milestones where id = _milestone for update;
  if m.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not public.can_manage_project(m.tenant_id, m.project_id) then raise exception 'NOT_ALLOWED: only project admins set baselines' using errcode = 'P0001'; end if;
  if not public.project_module_active(m.tenant_id, m.project_id, 'programmes') then raise exception 'MODULE_OFF' using errcode = 'P0001'; end if;
  if m.version <> _expected_version then raise exception 'STALE_EDIT' using errcode = 'P0001'; end if;
  if _date is null then raise exception 'BASELINE_REQUIRED' using errcode = 'P0001'; end if;
  if m.baseline_date is not null and coalesce(length(trim(_reason)), 0) = 0 then raise exception 'REASON_REQUIRED: give a reason for re-baselining' using errcode = 'P0001'; end if;
  if m.baseline_date = _date then raise exception 'BASELINE_UNCHANGED' using errcode = 'P0001'; end if;
  select coalesce(max(baseline_no), 0) + 1 into v_no from public.milestone_baselines where milestone_id = m.id;
  insert into public.milestone_baselines (tenant_id, milestone_id, baseline_no, baseline_date, previous_date, reason, set_by)
  values (m.tenant_id, m.id, v_no, _date, m.baseline_date, coalesce(nullif(trim(_reason), ''), 'Initial baseline'), auth.uid());
  perform set_config('app.milestone_rebaseline', m.id::text, true);
  update public.project_milestones set baseline_date = _date where id = m.id;
  perform set_config('app.milestone_rebaseline', '', true);
  return v_no;
end $$;
revoke all on function public.set_milestone_baseline(uuid, date, text, integer) from public, anon;
grant execute on function public.set_milestone_baseline(uuid, date, text, integer) to authenticated;
revoke all on function public.guard_project_milestone(), public.record_initial_baseline() from public, anon, authenticated;

create trigger project_milestones_audit after insert or update on public.project_milestones for each row execute function public.write_audit('project_detail');