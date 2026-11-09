-- ============ Employees ============
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) between 1 and 200),
  job_title text not null default '' check (length(job_title) <= 200),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  active boolean not null default true,
  user_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, user_id)
);
create unique index employees_tenant_email_idx on public.employees (tenant_id, lower(email)) where email is not null;
grant select, insert, update on public.employees to authenticated;
grant all on public.employees to service_role;
alter table public.employees enable row level security;
create trigger employees_stamp_insert before insert on public.employees for each row execute function public.stamp_insert();
create trigger employees_stamp_update before update on public.employees for each row execute function public.stamp_update();

create or replace function public.current_employee_id(_tenant uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select e.id from public.employees e where e.tenant_id = _tenant and e.user_id = auth.uid() limit 1
$$;

-- ============ Effective-dated working patterns ============
create table public.working_patterns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  employee_id uuid not null,
  effective_from date not null,
  mon_hours numeric(4,2) not null default 7.5 check (mon_hours between 0 and 24),
  tue_hours numeric(4,2) not null default 7.5 check (tue_hours between 0 and 24),
  wed_hours numeric(4,2) not null default 7.5 check (wed_hours between 0 and 24),
  thu_hours numeric(4,2) not null default 7.5 check (thu_hours between 0 and 24),
  fri_hours numeric(4,2) not null default 7.5 check (fri_hours between 0 and 24),
  sat_hours numeric(4,2) not null default 0 check (sat_hours between 0 and 24),
  sun_hours numeric(4,2) not null default 0 check (sun_hours between 0 and 24),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete restrict,
  unique (tenant_id, employee_id, effective_from)
);
grant select, insert, update, delete on public.working_patterns to authenticated;
grant all on public.working_patterns to service_role;
alter table public.working_patterns enable row level security;
create trigger working_patterns_stamp_insert before insert on public.working_patterns for each row execute function public.stamp_insert();
create trigger working_patterns_stamp_update before update on public.working_patterns for each row execute function public.stamp_update();

-- ============ Clients ============
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 200),
  contact_name text check (contact_name is null or length(contact_name) <= 200),
  contact_email text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  unique (tenant_id, id)
);
create unique index clients_tenant_name_idx on public.clients (tenant_id, lower(name));
grant select, insert, update on public.clients to authenticated;
grant all on public.clients to service_role;
alter table public.clients enable row level security;
create trigger clients_stamp_insert before insert on public.clients for each row execute function public.stamp_insert();
create trigger clients_stamp_update before update on public.clients for each row execute function public.stamp_update();

-- ============ Projects ============
create table public.project_reference_counters (
  tenant_id uuid primary key references public.tenants(id) on delete restrict,
  last_value integer not null default 0
);
grant all on public.project_reference_counters to service_role;
alter table public.project_reference_counters enable row level security;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  reference text not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  client_id uuid,
  project_manager_id uuid,
  status public.project_status not null default 'draft',
  start_date date not null,
  planned_finish_date date not null,
  scope text not null default '' check (length(scope) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, reference),
  foreign key (tenant_id, client_id) references public.clients (tenant_id, id) on delete restrict,
  foreign key (tenant_id, project_manager_id) references public.employees (tenant_id, id) on delete restrict,
  check (planned_finish_date >= start_date)
);
grant select, insert, update on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;
create trigger projects_stamp_insert before insert on public.projects for each row execute function public.stamp_insert();
create trigger projects_stamp_update before update on public.projects for each row execute function public.stamp_update();

create or replace function public.assign_project_reference()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_seq integer;
  v_prefix text;
begin
  insert into public.project_reference_counters (tenant_id, last_value) values (new.tenant_id, 1)
  on conflict (tenant_id) do update set last_value = public.project_reference_counters.last_value + 1
  returning last_value into v_seq;
  select project_prefix into v_prefix from public.tenants where id = new.tenant_id;
  new.reference := v_prefix || '-' || case when v_seq >= 1000 then v_seq::text else lpad(v_seq::text, 4, '0') end;
  return new;
end $$;
create trigger projects_assign_reference before insert on public.projects for each row execute function public.assign_project_reference();

-- ============ Commercial (restricted) ============
create table public.project_commercials (
  project_id uuid primary key,
  tenant_id uuid not null,
  agreed_fee numeric(14,2) check (agreed_fee >= 0),
  budget_hours numeric(10,2) check (budget_hours >= 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  foreign key (tenant_id, project_id) references public.projects (tenant_id, id) on delete restrict
);
grant select, insert, update on public.project_commercials to authenticated;
grant all on public.project_commercials to service_role;
alter table public.project_commercials enable row level security;
create trigger project_commercials_stamp_insert before insert on public.project_commercials for each row execute function public.stamp_insert();
create trigger project_commercials_stamp_update before update on public.project_commercials for each row execute function public.stamp_update();

-- ============ Allocations ============
create table public.allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  employee_id uuid not null,
  project_id uuid not null,
  allocation_date date not null,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  note text check (note is null or length(note) <= 200),
  needs_review boolean not null default false,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete restrict,
  foreign key (tenant_id, project_id) references public.projects (tenant_id, id) on delete restrict,
  unique (tenant_id, client_request_id)
);
create index allocations_tenant_date_idx on public.allocations (tenant_id, allocation_date);
create index allocations_employee_date_idx on public.allocations (tenant_id, employee_id, allocation_date);
create index allocations_project_date_idx on public.allocations (tenant_id, project_id, allocation_date);
grant select, insert, update, delete on public.allocations to authenticated;
grant all on public.allocations to service_role;
alter table public.allocations enable row level security;
create trigger allocations_stamp_insert before insert on public.allocations for each row execute function public.stamp_insert();
create trigger allocations_stamp_update before update on public.allocations for each row execute function public.stamp_update();

create or replace function public.employee_allocated_to(_tenant uuid, _project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allocations a
    where a.tenant_id = _tenant and a.project_id = _project
      and a.employee_id = public.current_employee_id(_tenant)
  )
$$;

-- ============ Business-rule guards ============
create or replace function public.guard_allocation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_status public.project_status;
  v_active boolean;
begin
  if tg_op = 'INSERT' or new.employee_id <> old.employee_id then
    select active into v_active from public.employees where tenant_id = new.tenant_id and id = new.employee_id;
    if not coalesce(v_active, false) then
      raise exception 'EMPLOYEE_INACTIVE: inactive people cannot receive new allocations' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'INSERT' or new.project_id <> old.project_id or new.allocation_date <> old.allocation_date then
    select status into v_status from public.projects where tenant_id = new.tenant_id and id = new.project_id;
    if v_status in ('draft', 'completed', 'archived') then
      raise exception 'PROJECT_NOT_ALLOCATABLE: % projects cannot receive allocations', v_status using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger allocations_guard before insert or update on public.allocations for each row execute function public.guard_allocation();

-- Closing (or returning to draft) a project needs its future allocations resolved first.
create or replace function public.guard_project_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reference <> old.reference then
    raise exception 'IMMUTABLE: project references never change' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status
     and new.status in ('draft', 'completed', 'archived')
     and exists (
       select 1 from public.allocations a
       where a.tenant_id = new.tenant_id and a.project_id = new.id
         and a.allocation_date >= public.tenant_today(new.tenant_id)
     ) then
    raise exception 'PROJECT_HAS_FUTURE_ALLOCATIONS: resolve future allocations before changing status to %', new.status using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger projects_guard_update before update on public.projects for each row execute function public.guard_project_status();

-- Linking a login to an employee is user administration: Owner/Admin only, and only to a member of the same business.
create or replace function public.guard_employee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id) then
    if auth.uid() is not null and not public.is_tenant_admin(new.tenant_id) then
      raise exception 'ADMIN_ONLY: only an Owner/Admin can link a login to an employee' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.tenant_memberships m where m.tenant_id = new.tenant_id and m.user_id = new.user_id) then
      raise exception 'NOT_A_MEMBER: that login is not a member of this business' using errcode = 'P0001';
    end if;
  elsif tg_op = 'UPDATE' and new.user_id is null and old.user_id is not null
        and auth.uid() is not null and not public.is_tenant_admin(new.tenant_id) then
    raise exception 'ADMIN_ONLY: only an Owner/Admin can unlink a login' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger employees_guard before insert or update on public.employees for each row execute function public.guard_employee();

-- New employees start on the business's default working week.
create or replace function public.init_employee_pattern()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_h numeric(4,2)[];
begin
  select default_weekly_hours into v_h from public.tenants where id = new.tenant_id;
  insert into public.working_patterns (tenant_id, employee_id, effective_from, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours, created_by)
  values (new.tenant_id, new.id, date '2000-01-01', v_h[1], v_h[2], v_h[3], v_h[4], v_h[5], v_h[6], v_h[7], new.created_by);
  return null;
end $$;
create trigger employees_init_pattern after insert on public.employees for each row execute function public.init_employee_pattern();

-- Deactivating keeps history and flags future allocations for review.
create or replace function public.flag_inactive_employee_allocations()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.allocations set needs_review = true
  where tenant_id = new.tenant_id and employee_id = new.id
    and allocation_date >= public.tenant_today(new.tenant_id) and not needs_review;
  return null;
end $$;
create trigger employees_flag_on_deactivate after update of active on public.employees for each row
  when (old.active and not new.active)
  execute function public.flag_inactive_employee_allocations();

-- Changing a working pattern must not alter capacity on past dates that already have allocations.
create or replace function public.guard_working_pattern()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row public.working_patterns;
  v_from date;
  v_today date;
begin
  v_row := coalesce(new, old);
  v_today := public.tenant_today(v_row.tenant_id);
  if tg_op = 'INSERT' then
    v_from := new.effective_from;
  elsif tg_op = 'UPDATE' then
    if new.employee_id <> old.employee_id then
      raise exception 'IMMUTABLE: a working pattern cannot move to another person' using errcode = 'P0001';
    end if;
    v_from := least(new.effective_from, old.effective_from);
  else
    v_from := old.effective_from;
  end if;
  if v_from < v_today and exists (
    select 1 from public.allocations a
    where a.tenant_id = v_row.tenant_id and a.employee_id = v_row.employee_id
      and a.allocation_date >= v_from and a.allocation_date < v_today
  ) then
    raise exception 'PATTERN_REWRITES_HISTORY: add a new pattern starting today or later instead' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger working_patterns_guard before insert or update or delete on public.working_patterns for each row execute function public.guard_working_pattern();

-- One base currency per tenant; it cannot change once commercial values exist.
create or replace function public.guard_tenant_currency()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.base_currency <> old.base_currency and exists (
    select 1 from public.project_commercials pc where pc.tenant_id = new.id
  ) then
    raise exception 'CURRENCY_LOCKED: base currency cannot change once fees are recorded' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger tenants_guard_currency before update of base_currency on public.tenants for each row execute function public.guard_tenant_currency();

-- ============ Policies ============
create policy "Managers see all employees; people see their own record"
  on public.employees for select to authenticated
  using (public.is_tenant_manager(tenant_id) or (user_id = auth.uid() and public.is_active_member(tenant_id)));
create policy "Managers can add employees"
  on public.employees for insert to authenticated
  with check (public.is_tenant_manager(tenant_id));
create policy "Managers can update employees"
  on public.employees for update to authenticated
  using (public.is_tenant_manager(tenant_id))
  with check (public.is_tenant_manager(tenant_id));

create policy "Managers see all patterns; people see their own"
  on public.working_patterns for select to authenticated
  using (public.is_tenant_manager(tenant_id)
         or (public.is_active_member(tenant_id) and employee_id = public.current_employee_id(tenant_id)));
create policy "Managers can add patterns"
  on public.working_patterns for insert to authenticated
  with check (public.is_tenant_manager(tenant_id));
create policy "Managers can update patterns"
  on public.working_patterns for update to authenticated
  using (public.is_tenant_manager(tenant_id))
  with check (public.is_tenant_manager(tenant_id));
create policy "Managers can remove patterns"
  on public.working_patterns for delete to authenticated
  using (public.is_tenant_manager(tenant_id));

create policy "Managers see clients when Clients & Projects is on"
  on public.clients for select to authenticated
  using (public.module_enabled(tenant_id, 'clients_projects') and public.is_tenant_manager(tenant_id));
create policy "Managers can add clients"
  on public.clients for insert to authenticated
  with check (public.module_enabled(tenant_id, 'clients_projects') and public.is_tenant_manager(tenant_id));
create policy "Managers can update clients"
  on public.clients for update to authenticated
  using (public.module_enabled(tenant_id, 'clients_projects') and public.is_tenant_manager(tenant_id))
  with check (public.module_enabled(tenant_id, 'clients_projects') and public.is_tenant_manager(tenant_id));

create policy "Managers see projects; employees see projects they are allocated to"
  on public.projects for select to authenticated
  using (
    public.module_enabled(tenant_id, 'clients_projects') and (
      public.is_tenant_manager(tenant_id)
      or (public.module_enabled(tenant_id, 'resource_planning')
          and public.is_active_member(tenant_id)
          and public.employee_allocated_to(tenant_id, id))
    )
  );
create policy "Managers can add projects"
  on public.projects for insert to authenticated
  with check (public.module_enabled(tenant_id, 'clients_projects') and public.is_tenant_manager(tenant_id));
create policy "Managers can update projects"
  on public.projects for update to authenticated
  using (public.module_enabled(tenant_id, 'clients_projects') and public.is_tenant_manager(tenant_id))
  with check (public.module_enabled(tenant_id, 'clients_projects') and public.is_tenant_manager(tenant_id));

create policy "Commercial users can see fees and budget hours"
  on public.project_commercials for select to authenticated
  using (public.has_commercial_access(tenant_id));
create policy "Commercial users can add fees and budget hours"
  on public.project_commercials for insert to authenticated
  with check (public.has_commercial_access(tenant_id));
create policy "Commercial users can change fees and budget hours"
  on public.project_commercials for update to authenticated
  using (public.has_commercial_access(tenant_id))
  with check (public.has_commercial_access(tenant_id));

create policy "Managers see all allocations; employees see their own"
  on public.allocations for select to authenticated
  using (
    public.module_enabled(tenant_id, 'resource_planning') and (
      public.is_tenant_manager(tenant_id)
      or (public.is_active_member(tenant_id) and employee_id = public.current_employee_id(tenant_id))
    )
  );
create policy "Managers can add allocations"
  on public.allocations for insert to authenticated
  with check (public.module_enabled(tenant_id, 'resource_planning') and public.is_tenant_manager(tenant_id));
create policy "Managers can update allocations"
  on public.allocations for update to authenticated
  using (public.module_enabled(tenant_id, 'resource_planning') and public.is_tenant_manager(tenant_id))
  with check (public.module_enabled(tenant_id, 'resource_planning') and public.is_tenant_manager(tenant_id));
create policy "Managers can remove allocations"
  on public.allocations for delete to authenticated
  using (public.module_enabled(tenant_id, 'resource_planning') and public.is_tenant_manager(tenant_id));

-- ============ Audit triggers ============
create trigger employees_audit_insert after insert on public.employees for each row execute function public.write_audit('employee');
create trigger employees_audit_update after update on public.employees for each row
  when (old.active is distinct from new.active or old.user_id is distinct from new.user_id)
  execute function public.write_audit('employee');
create trigger working_patterns_audit after insert or update or delete on public.working_patterns for each row execute function public.write_audit('working_pattern');
create trigger projects_audit_insert after insert on public.projects for each row execute function public.write_audit('project');
create trigger projects_audit_update after update on public.projects for each row
  when (old.status is distinct from new.status)
  execute function public.write_audit('project');
create trigger allocations_audit after insert or update or delete on public.allocations for each row execute function public.write_audit('allocation');
create trigger project_commercials_audit after insert or update or delete on public.project_commercials for each row execute function public.write_audit('commercial');