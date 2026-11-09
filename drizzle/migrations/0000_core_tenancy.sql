-- ============ Enums ============
create type public.tenant_status as enum ('active', 'suspended');
create type public.tenant_role as enum ('owner_admin', 'resource_manager', 'employee');
create type public.membership_status as enum ('invited', 'active', 'suspended', 'removed');
create type public.project_status as enum ('draft', 'active', 'on_hold', 'completed', 'archived');

-- ============ Shared row-stamping triggers ============
create or replace function public.stamp_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  new.created_at := now();
  new.created_by := coalesce(auth.uid(), new.created_by);
  new.updated_at := new.created_at;
  new.updated_by := new.created_by;
  new.version := 1;
  return new;
end $$;

create or replace function public.stamp_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if (to_jsonb(new) ? 'tenant_id') and (to_jsonb(new)->>'tenant_id') is distinct from (to_jsonb(old)->>'tenant_id') then
    raise exception 'TENANT_IMMUTABLE: records cannot be moved to another business' using errcode = 'P0001';
  end if;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.version := old.version + 1;
  return new;
end $$;

-- ============ Platform administrators ============
create table public.platform_admins (
  user_id uuid primary key,
  email text not null,
  created_at timestamptz not null default now()
);
grant select on public.platform_admins to authenticated;
grant all on public.platform_admins to service_role;
alter table public.platform_admins enable row level security;
create policy "Users can see their own platform admin row"
  on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

-- Emails allowed to claim platform admin once, after confirming their email. Not readable by app users.
create table public.platform_admin_bootstrap (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
grant all on public.platform_admin_bootstrap to service_role;
alter table public.platform_admin_bootstrap enable row level security;
insert into public.platform_admin_bootstrap (email) values ('dan@emeraldrockgroup.com');

-- ============ Tenants ============
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (length(btrim(business_name)) between 1 and 200),
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  logo_path text,
  brand_colour text not null default '#0F6B4F' check (brand_colour ~ '^#[0-9A-Fa-f]{6}$'),
  timezone text not null default 'Europe/London',
  base_currency text not null default 'GBP' check (base_currency ~ '^[A-Z]{3}$'),
  date_format text not null default 'DD/MM/YYYY' check (date_format in ('DD/MM/YYYY', 'YYYY-MM-DD')),
  week_starts_on text not null default 'monday' check (week_starts_on = 'monday'),
  default_weekly_hours numeric(4,2)[] not null default '{7.5,7.5,7.5,7.5,7.5,0,0}'
    check (array_length(default_weekly_hours, 1) = 7 and 0 <= all (default_weekly_hours) and 24 >= all (default_weekly_hours)),
  project_prefix text not null default 'ERC' check (project_prefix ~ '^[A-Z][A-Z0-9]{1,5}$'),
  status public.tenant_status not null default 'active',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1
);
grant select, insert, update on public.tenants to authenticated;
grant all on public.tenants to service_role;
alter table public.tenants enable row level security;

create trigger tenants_stamp_insert before insert on public.tenants for each row execute function public.stamp_insert();
create trigger tenants_stamp_update before update on public.tenants for each row execute function public.stamp_update();

-- ============ Module catalogue ============
create table public.modules (
  id text primary key,
  name text not null,
  description text not null,
  depends_on text[] not null default '{}',
  sort_order integer not null
);
grant select on public.modules to authenticated;
grant all on public.modules to service_role;
alter table public.modules enable row level security;
create policy "Signed-in users can read the module catalogue"
  on public.modules for select to authenticated using (true);

insert into public.modules (id, name, description, depends_on, sort_order) values
  ('clients_projects', 'Clients & Projects', 'Client records, project records, ownership, dates and statuses.', '{}', 1),
  ('resource_planning', 'Resource Planning', 'Daily allocations, capacity and conflict warnings.', '{clients_projects}', 2),
  ('commercial', 'Commercial', 'Agreed project fees and budget hours.', '{clients_projects}', 3);

create table public.tenant_modules (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  module_id text not null references public.modules(id) on delete restrict,
  enabled boolean not null default false,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  primary key (tenant_id, module_id)
);
grant select, insert, update on public.tenant_modules to authenticated;
grant all on public.tenant_modules to service_role;
alter table public.tenant_modules enable row level security;

-- ============ Memberships ============
create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  user_id uuid not null,
  email text not null check (email = lower(email)),
  role public.tenant_role not null,
  status public.membership_status not null default 'invited',
  commercial_access boolean not null default false,
  invited_by uuid,
  invited_at timestamptz not null default now(),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  version integer not null default 1,
  unique (tenant_id, user_id)
);
create index tenant_memberships_user_idx on public.tenant_memberships (user_id);
grant select, update on public.tenant_memberships to authenticated;
grant all on public.tenant_memberships to service_role;
alter table public.tenant_memberships enable row level security;

create trigger memberships_stamp_insert before insert on public.tenant_memberships for each row execute function public.stamp_insert();
create trigger memberships_stamp_update before update on public.tenant_memberships for each row execute function public.stamp_update();

-- ============ Access helper functions (source of truth for policies) ============
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

-- Has a usable membership (active), regardless of tenant status. Used only to show the tenant's name/status.
create or replace function public.has_membership(_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = _tenant and m.user_id = auth.uid() and m.status = 'active'
  )
$$;

-- Active membership AND active tenant. Required for every operational read/write.
create or replace function public.is_active_member(_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_memberships m
    join public.tenants t on t.id = m.tenant_id
    where m.tenant_id = _tenant and m.user_id = auth.uid()
      and m.status = 'active' and t.status = 'active'
  )
$$;

create or replace function public.has_tenant_role(_tenant uuid, _roles public.tenant_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_memberships m
    join public.tenants t on t.id = m.tenant_id
    where m.tenant_id = _tenant and m.user_id = auth.uid()
      and m.status = 'active' and t.status = 'active'
      and m.role = any (_roles)
  )
$$;

create or replace function public.is_tenant_admin(_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_tenant_role(_tenant, array['owner_admin']::public.tenant_role[])
$$;

create or replace function public.is_tenant_manager(_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_tenant_role(_tenant, array['owner_admin', 'resource_manager']::public.tenant_role[])
$$;

create or replace function public.module_enabled(_tenant uuid, _module text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_modules tm
    where tm.tenant_id = _tenant and tm.module_id = _module and tm.enabled
  )
$$;

create or replace function public.has_commercial_access(_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.module_enabled(_tenant, 'commercial')
    and public.module_enabled(_tenant, 'clients_projects')
    and exists (
      select 1 from public.tenant_memberships m
      join public.tenants t on t.id = m.tenant_id
      where m.tenant_id = _tenant and m.user_id = auth.uid()
        and m.status = 'active' and t.status = 'active'
        and (m.role = 'owner_admin' or (m.role = 'resource_manager' and m.commercial_access))
    )
$$;

create or replace function public.tenant_today(_tenant uuid)
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.tenants where id = _tenant), 'Europe/London'))::date
$$;

-- ============ Policies: tenants, modules, memberships ============
create policy "Members and platform admins can see a tenant"
  on public.tenants for select to authenticated
  using (public.is_platform_admin() or public.has_membership(id));
create policy "Platform admins can create tenants"
  on public.tenants for insert to authenticated
  with check (public.is_platform_admin());
create policy "Platform admins and tenant admins can update a tenant"
  on public.tenants for update to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(id))
  with check (public.is_platform_admin() or public.is_tenant_admin(id));

create policy "Members and platform admins can see module settings"
  on public.tenant_modules for select to authenticated
  using (public.is_platform_admin() or public.is_active_member(tenant_id));
create policy "Platform admins can add module settings"
  on public.tenant_modules for insert to authenticated
  with check (public.is_platform_admin());
create policy "Platform admins can change module settings"
  on public.tenant_modules for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "Users see their own memberships; admins see their tenant's"
  on public.tenant_memberships for select to authenticated
  using (user_id = auth.uid() or public.is_tenant_admin(tenant_id) or public.is_platform_admin());
create policy "Tenant admins can change memberships"
  on public.tenant_memberships for update to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

-- ============ Tenant guards ============
create or replace function public.guard_tenant_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'PLATFORM_ONLY: only a platform administrator can change a business''s status' using errcode = 'P0001';
  end if;
  if new.is_demo is distinct from old.is_demo and auth.uid() is not null then
    raise exception 'IMMUTABLE: demo flag cannot be changed' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger tenants_guard_update before update on public.tenants for each row execute function public.guard_tenant_update();

create or replace function public.validate_tenant_timezone()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'INVALID_TIMEZONE: % is not a recognised timezone', new.timezone using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger tenants_validate_timezone before insert or update of timezone on public.tenants for each row execute function public.validate_tenant_timezone();

-- Every new tenant gets a row per module, all disabled.
create or replace function public.init_tenant_modules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tenant_modules (tenant_id, module_id, enabled, changed_by)
  select new.id, m.id, false, auth.uid() from public.modules m
  on conflict do nothing;
  return null;
end $$;
create trigger tenants_init_modules after insert on public.tenants for each row execute function public.init_tenant_modules();

-- ============ Module dependency enforcement ============
create or replace function public.guard_tenant_module()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_missing text[];
  v_dependants text[];
begin
  new.changed_by := coalesce(auth.uid(), new.changed_by);
  new.changed_at := now();
  if tg_op = 'UPDATE' and (new.tenant_id <> old.tenant_id or new.module_id <> old.module_id) then
    raise exception 'IMMUTABLE: module settings cannot be moved' using errcode = 'P0001';
  end if;
  if new.enabled then
    select coalesce(array_agg(d), '{}') into v_missing
    from public.modules m, unnest(m.depends_on) d
    where m.id = new.module_id
      and not public.module_enabled(new.tenant_id, d);
    if array_length(v_missing, 1) > 0 then
      raise exception 'MODULE_DEPENDENCY_DISABLED: enable % first', array_to_string(v_missing, ', ') using errcode = 'P0001';
    end if;
  else
    select coalesce(array_agg(m.id), '{}') into v_dependants
    from public.modules m
    where new.module_id = any (m.depends_on)
      and public.module_enabled(new.tenant_id, m.id);
    if array_length(v_dependants, 1) > 0 then
      raise exception 'MODULE_HAS_DEPENDANTS: disable % first', array_to_string(v_dependants, ', ') using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger tenant_modules_guard before insert or update on public.tenant_modules for each row execute function public.guard_tenant_module();

-- ============ Membership guards ============
create or replace function public.guard_membership_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id <> old.user_id or new.email <> old.email then
    raise exception 'IMMUTABLE: a membership cannot be moved to another person' using errcode = 'P0001';
  end if;
  if auth.uid() is not null and old.user_id = auth.uid()
     and (new.role is distinct from old.role
          or new.commercial_access is distinct from old.commercial_access
          or (new.status is distinct from old.status and not (old.status = 'invited' and new.status = 'active'))) then
    raise exception 'SELF_CHANGE: you cannot change your own role, access or status' using errcode = 'P0001';
  end if;
  if new.role <> 'resource_manager' then
    new.commercial_access := false;
  end if;
  if new.status = 'active' and old.status = 'invited' and new.activated_at is null then
    new.activated_at := now();
  end if;
  -- Keep at least one active Owner/Admin.
  if old.role = 'owner_admin' and old.status = 'active'
     and (new.role <> 'owner_admin' or new.status <> 'active')
     and not exists (
       select 1 from public.tenant_memberships m
       where m.tenant_id = old.tenant_id and m.id <> old.id and m.role = 'owner_admin' and m.status = 'active'
     ) then
    raise exception 'LAST_OWNER: a business must keep at least one active Owner/Admin' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger memberships_guard_update before update on public.tenant_memberships for each row execute function public.guard_membership_update();

-- Called after sign-in: turns the caller's pending invitations into active memberships.
create or replace function public.activate_my_memberships()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if auth.uid() is null then return 0; end if;
  update public.tenant_memberships set status = 'active'
  where user_id = auth.uid() and status = 'invited';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- One-time secure bootstrap of a platform administrator from the pre-approved email list.
create or replace function public.claim_platform_admin()
returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from public.platform_admins where user_id = auth.uid()) then return true; end if;
  select lower(u.email) into v_email from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is null or not exists (select 1 from public.platform_admin_bootstrap where email = v_email) then
    return false;
  end if;
  insert into public.platform_admins (user_id, email) values (auth.uid(), v_email) on conflict do nothing;
  delete from public.platform_admin_bootstrap where email = v_email;
  return true;
end $$;

-- ============ Audit log (append-only) ============
create table public.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants(id) on delete restrict,
  category text not null check (category in ('tenant', 'module', 'membership', 'employee', 'working_pattern', 'project', 'allocation', 'commercial')),
  action text not null check (action in ('insert', 'update', 'delete')),
  record_table text not null,
  record_id text,
  actor_id uuid,
  actor_email text,
  occurred_at timestamptz not null default now(),
  old_values jsonb,
  new_values jsonb
);
create index audit_log_tenant_idx on public.audit_log (tenant_id, occurred_at desc);
create index audit_log_record_idx on public.audit_log (record_table, record_id);
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "Audit visibility follows the source information"
  on public.audit_log for select to authenticated
  using (
    (category = 'commercial' and public.has_commercial_access(tenant_id))
    or (category <> 'commercial' and public.is_tenant_admin(tenant_id))
    or (category in ('tenant', 'module') and public.is_platform_admin())
  );

create or replace function public.prevent_audit_change()
returns trigger language plpgsql as $$
begin
  raise exception 'AUDIT_APPEND_ONLY: audit history cannot be changed or deleted' using errcode = 'P0001';
end $$;
create trigger audit_log_append_only before update or delete on public.audit_log for each row execute function public.prevent_audit_change();

create or replace function public.write_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_email text;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);
  if auth.uid() is not null then
    select email into v_email from auth.users where id = auth.uid();
  end if;
  insert into public.audit_log (tenant_id, category, action, record_table, record_id, actor_id, actor_email, old_values, new_values)
  values (
    case when tg_table_name = 'tenants' then (v_row->>'id')::uuid else (v_row->>'tenant_id')::uuid end,
    tg_argv[0],
    lower(tg_op),
    tg_table_name,
    coalesce(v_row->>'id', v_row->>'project_id', v_row->>'module_id'),
    auth.uid(),
    v_email,
    v_old,
    v_new
  );
  return null;
end $$;

create trigger tenants_audit_insert after insert on public.tenants for each row execute function public.write_audit('tenant');
create trigger tenants_audit_update after update on public.tenants for each row execute function public.write_audit('tenant');
create trigger tenant_modules_audit after insert or update on public.tenant_modules for each row execute function public.write_audit('module');
create trigger memberships_audit_insert after insert on public.tenant_memberships for each row execute function public.write_audit('membership');
create trigger memberships_audit_update after update on public.tenant_memberships for each row
  when (old.role is distinct from new.role or old.status is distinct from new.status or old.commercial_access is distinct from new.commercial_access)
  execute function public.write_audit('membership');