-- Forecast final account sits beside the agreed fee, under the same commercial-only policies.
alter table public.project_commercials
  add column forecast_final_account numeric check (forecast_final_account is null or (forecast_final_account >= 0 and forecast_final_account <= 999999999.99)),
  add column forecast_updated_on date,
  add column forecast_note text not null default '' check (length(forecast_note) <= 1000);

create or replace function public.stamp_commercial_forecast()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.forecast_updated_on := case when new.forecast_final_account is not null then public.tenant_today(new.tenant_id) end;
  else
    new.forecast_updated_on := case when new.forecast_final_account is distinct from old.forecast_final_account then public.tenant_today(new.tenant_id) else old.forecast_updated_on end;
  end if;
  return new;
end $$;
revoke all on function public.stamp_commercial_forecast() from public, anon, authenticated;
create trigger project_commercials_forecast_stamp before insert or update on public.project_commercials for each row execute function public.stamp_commercial_forecast();

-- Estimated value of a change. Kept apart from project_records so project viewers never see money.
create table public.change_estimates (
  record_id uuid primary key,
  tenant_id uuid not null,
  project_id uuid not null,
  amount numeric not null check (amount >= -999999999.99 and amount <= 999999999.99),
  note text not null default '' check (length(note) <= 1000),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1,
  foreign key (tenant_id, record_id) references public.project_records (tenant_id, id) on delete restrict,
  foreign key (tenant_id, project_id) references public.projects (tenant_id, id) on delete restrict
);
grant select, insert, update on public.change_estimates to authenticated;
grant all on public.change_estimates to service_role;

create or replace function public.guard_change_estimate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.record_id <> old.record_id or new.tenant_id <> old.tenant_id or new.project_id <> old.project_id) then
    raise exception 'IMMUTABLE: an estimate stays with its change' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.project_records r where r.id = new.record_id and r.tenant_id = new.tenant_id
                 and r.project_id = new.project_id and r.module_id = 'change_control') then
    raise exception 'NOT_A_CHANGE: estimates can only be added to change register items' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.guard_change_estimate() from public, anon, authenticated;
create trigger change_estimates_guard before insert or update on public.change_estimates for each row execute function public.guard_change_estimate();
create trigger change_estimates_stamp_insert before insert on public.change_estimates for each row execute function public.stamp_insert();
create trigger change_estimates_stamp_update before update on public.change_estimates for each row execute function public.stamp_update();
create trigger change_estimates_audit after insert or update on public.change_estimates for each row execute function public.write_audit('commercial');

alter table public.change_estimates enable row level security;
create policy "Commercial users see change estimates on projects they can view"
  on public.change_estimates for select to authenticated using (
    public.has_commercial_access(tenant_id) and public.can_view_project(tenant_id, project_id)
    and (public.project_module_active(tenant_id, project_id, 'change_control') or public.can_manage_project(tenant_id, project_id)));
create policy "Commercial users add change estimates while change control is on"
  on public.change_estimates for insert to authenticated with check (
    public.has_commercial_access(tenant_id) and public.can_view_project(tenant_id, project_id)
    and public.project_module_active(tenant_id, project_id, 'change_control'));
create policy "Commercial users change estimates while change control is on"
  on public.change_estimates for update to authenticated
  using (public.has_commercial_access(tenant_id) and public.can_view_project(tenant_id, project_id) and public.project_module_active(tenant_id, project_id, 'change_control'))
  with check (public.has_commercial_access(tenant_id) and public.can_view_project(tenant_id, project_id) and public.project_module_active(tenant_id, project_id, 'change_control'));