-- ===== Module catalogue: project-level modules =====
alter table public.modules add column kind text not null default 'business' check (kind in ('business','project'));
alter table public.modules add column built boolean not null default true;

insert into public.modules (id, name, description, depends_on, sort_order, kind, built) values
  ('progress_reports','Progress reports','Site progress, achievements, constraints and next steps.','{clients_projects}',10,'project',false),
  ('photos','Photos','Capture, upload, organise and retrieve project photographs.','{clients_projects}',11,'project',false),
  ('delay_reports','Delay reports','Record events, evidence and potential programme effects.','{clients_projects}',12,'project',false),
  ('qa','QA','Inspections, checklists, defects and corrective actions.','{clients_projects}',13,'project',false),
  ('handover','Handover','Completion records, outstanding items and handover packs.','{clients_projects}',14,'project',false),
  ('rams','RAMS and risk assessments','Submission, review, revision and acknowledgement.','{clients_projects}',15,'project',false),
  ('deliveries','Deliveries','Planned deliveries, actual arrivals and delivery evidence.','{clients_projects}',16,'project',false),
  ('programmes','Programmes','Programme files, revisions, status and programme register.','{clients_projects}',17,'project',false),
  ('documents','Documents','Folder-based project document storage.','{clients_projects}',18,'project',false),
  ('early_warnings','Early warnings','EWN register, templates, actions and issue records.','{clients_projects}',19,'project',false),
  ('rfis','RFIs','RFI register, templates, responses and overdue tracking.','{clients_projects}',20,'project',false),
  ('procurement','Procurement','Procurement schedules and required-by dates.','{clients_projects}',21,'project',false),
  ('assets_plant','Assets and plant','Equipment records, allocation and inspection dates.','{clients_projects}',22,'project',false),
  ('drawings','Drawings','Controlled drawing register and revision history.','{clients_projects}',23,'project',false),
  ('change_control','Change control','Proposed changes, supporting evidence and assessment.','{clients_projects}',24,'project',false);

insert into public.tenant_modules (tenant_id, module_id, enabled)
select t.id, m.id, false from public.tenants t cross join public.modules m where m.kind = 'project'
on conflict do nothing;

-- ===== Project details =====
alter table public.projects add column description text not null default '';
alter table public.projects add column site_address text not null default '';
alter table public.projects add column contract_form text not null default '';
alter table public.projects add column contract_reference text not null default '';
alter table public.projects add column contract_notes text not null default '';
alter table public.projects add column template_id uuid;

-- ===== Project team =====
create table public.project_team (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  employee_id uuid not null,
  project_role text not null default 'member' check (project_role in ('project_admin','member','viewer')),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1,
  foreign key (tenant_id, project_id) references public.projects (tenant_id, id) on delete restrict,
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete restrict,
  unique (project_id, employee_id)
);
grant select, insert, update, delete on public.project_team to authenticated;
grant all on public.project_team to service_role;

create or replace function public.project_role_of(_tenant uuid, _project uuid)
returns text language sql stable security definer set search_path = public as $$
  select pt.project_role from public.project_team pt
  where pt.tenant_id = _tenant and pt.project_id = _project
    and pt.employee_id = public.current_employee_id(_tenant)
    and public.is_active_member(_tenant)
  limit 1
$$;

create or replace function public.can_manage_project(_tenant uuid, _project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.module_enabled(_tenant, 'clients_projects') and (
    public.is_tenant_manager(_tenant) or public.project_role_of(_tenant, _project) = 'project_admin')
$$;

create or replace function public.can_view_project(_tenant uuid, _project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.module_enabled(_tenant, 'clients_projects') and (
    public.is_tenant_manager(_tenant)
    or public.project_role_of(_tenant, _project) is not null
    or (public.module_enabled(_tenant, 'resource_planning') and public.is_active_member(_tenant)
        and public.employee_allocated_to(_tenant, _project)))
$$;

create or replace function public.can_contribute_project(_tenant uuid, _project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.module_enabled(_tenant, 'clients_projects') and (
    public.is_tenant_manager(_tenant) or public.project_role_of(_tenant, _project) in ('project_admin','member'))
$$;

drop policy "Managers see projects; employees see projects they are allocated to" on public.projects;
create policy "Managers, team members and allocated staff see projects"
  on public.projects for select to authenticated using (public.can_view_project(tenant_id, id));
create policy "Project admins can update their projects"
  on public.projects for update to authenticated
  using (public.can_manage_project(tenant_id, id)) with check (public.can_manage_project(tenant_id, id));

alter table public.project_team enable row level security;
create policy "Project viewers see the team" on public.project_team for select to authenticated using (public.can_view_project(tenant_id, project_id));
create policy "Project admins add team members" on public.project_team for insert to authenticated with check (public.can_manage_project(tenant_id, project_id));
create policy "Project admins change team members" on public.project_team for update to authenticated using (public.can_manage_project(tenant_id, project_id)) with check (public.can_manage_project(tenant_id, project_id));
create policy "Project admins remove team members" on public.project_team for delete to authenticated using (public.can_manage_project(tenant_id, project_id));

-- ===== Organisations =====
create table public.project_organisations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 200),
  org_role text not null default 'other' check (org_role in ('client','contractor','subcontractor','designer','consultant','supplier','other')),
  contact_name text, contact_email text, contact_phone text,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1,
  foreign key (tenant_id, project_id) references public.projects (tenant_id, id) on delete restrict,
  unique (tenant_id, id)
);
grant select, insert, update, delete on public.project_organisations to authenticated;
grant all on public.project_organisations to service_role;
alter table public.project_organisations enable row level security;
create policy "Project viewers see organisations" on public.project_organisations for select to authenticated using (public.can_view_project(tenant_id, project_id));
create policy "Project admins add organisations" on public.project_organisations for insert to authenticated with check (public.can_manage_project(tenant_id, project_id));
create policy "Project admins change organisations" on public.project_organisations for update to authenticated using (public.can_manage_project(tenant_id, project_id)) with check (public.can_manage_project(tenant_id, project_id));
create policy "Project admins remove organisations" on public.project_organisations for delete to authenticated using (public.can_manage_project(tenant_id, project_id));

-- ===== Key dates =====
create table public.project_key_dates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  label text not null check (length(trim(label)) between 1 and 200),
  due_on date not null,
  achieved_on date,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1,
  foreign key (tenant_id, project_id) references public.projects (tenant_id, id) on delete restrict
);
grant select, insert, update, delete on public.project_key_dates to authenticated;
grant all on public.project_key_dates to service_role;
alter table public.project_key_dates enable row level security;
create policy "Project viewers see key dates" on public.project_key_dates for select to authenticated using (public.can_view_project(tenant_id, project_id));
create policy "Project admins add key dates" on public.project_key_dates for insert to authenticated with check (public.can_manage_project(tenant_id, project_id));
create policy "Project admins change key dates" on public.project_key_dates for update to authenticated using (public.can_manage_project(tenant_id, project_id)) with check (public.can_manage_project(tenant_id, project_id));
create policy "Project admins remove key dates" on public.project_key_dates for delete to authenticated using (public.can_manage_project(tenant_id, project_id));

-- ===== Per-project module selection =====
create table public.project_modules (
  tenant_id uuid not null,
  project_id uuid not null,
  module_id text not null references public.modules(id),
  enabled boolean not null default true,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  primary key (project_id, module_id),
  foreign key (tenant_id, project_id) references public.projects (tenant_id, id) on delete restrict
);
grant select, insert, update on public.project_modules to authenticated;
grant all on public.project_modules to service_role;

create or replace function public.guard_project_module()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.changed_by := coalesce(auth.uid(), new.changed_by);
  new.changed_at := now();
  if tg_op = 'UPDATE' and (new.tenant_id <> old.tenant_id or new.project_id <> old.project_id or new.module_id <> old.module_id) then
    raise exception 'IMMUTABLE: module settings cannot be moved' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.modules m where m.id = new.module_id and m.kind = 'project') then
    raise exception 'NOT_PROJECT_MODULE: % is not a project module', new.module_id using errcode = 'P0001';
  end if;
  if new.enabled and not public.module_enabled(new.tenant_id, new.module_id) then
    raise exception 'MODULE_NOT_AVAILABLE: % is not switched on for this business', new.module_id using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger project_modules_guard before insert or update on public.project_modules for each row execute function public.guard_project_module();

create or replace function public.project_module_active(_tenant uuid, _project uuid, _module text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.module_enabled(_tenant, _module) and exists (
    select 1 from public.project_modules pm
    where pm.tenant_id = _tenant and pm.project_id = _project and pm.module_id = _module and pm.enabled)
$$;

alter table public.project_modules enable row level security;
create policy "Project viewers see project modules" on public.project_modules for select to authenticated using (public.can_view_project(tenant_id, project_id));
create policy "Project admins add project modules" on public.project_modules for insert to authenticated with check (public.can_manage_project(tenant_id, project_id));
create policy "Project admins change project modules" on public.project_modules for update to authenticated using (public.can_manage_project(tenant_id, project_id)) with check (public.can_manage_project(tenant_id, project_id));

-- ===== Project folders (groundwork for documents and photos) =====
create table public.project_folders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  parent_id uuid,
  name text not null check (length(trim(name)) between 1 and 120 and name !~ '[/\\]'),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1,
  foreign key (tenant_id, project_id) references public.projects (tenant_id, id) on delete restrict,
  unique (tenant_id, id),
  foreign key (tenant_id, parent_id) references public.project_folders (tenant_id, id) on delete restrict
);
create unique index project_folders_name_idx on public.project_folders (project_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
grant select, insert, update on public.project_folders to authenticated;
grant all on public.project_folders to service_role;
alter table public.project_folders enable row level security;
create policy "Project viewers see folders" on public.project_folders for select to authenticated using (public.can_view_project(tenant_id, project_id));
create policy "Project admins add folders" on public.project_folders for insert to authenticated with check (public.can_manage_project(tenant_id, project_id));
create policy "Project admins rename folders" on public.project_folders for update to authenticated using (public.can_manage_project(tenant_id, project_id)) with check (public.can_manage_project(tenant_id, project_id));

-- ===== Business-level project templates =====
create table public.project_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '',
  module_ids text[] not null default '{}',
  folder_paths text[] not null default '{}',
  settings jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1,
  unique (tenant_id, id)
);
create unique index project_templates_name_idx on public.project_templates (tenant_id, lower(name));
grant select, insert, update on public.project_templates to authenticated;
grant all on public.project_templates to service_role;
alter table public.project_templates enable row level security;
create policy "Managers see templates" on public.project_templates for select to authenticated using (public.module_enabled(tenant_id, 'clients_projects') and public.is_tenant_manager(tenant_id));
create policy "Owner/Admins add templates" on public.project_templates for insert to authenticated with check (public.module_enabled(tenant_id, 'clients_projects') and public.is_tenant_admin(tenant_id));
create policy "Owner/Admins change templates" on public.project_templates for update to authenticated using (public.module_enabled(tenant_id, 'clients_projects') and public.is_tenant_admin(tenant_id)) with check (public.module_enabled(tenant_id, 'clients_projects') and public.is_tenant_admin(tenant_id));

create or replace function public.guard_project_template()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_bad text[];
begin
  if tg_op = 'UPDATE' and new.tenant_id <> old.tenant_id then
    raise exception 'IMMUTABLE: templates cannot move business' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(x), '{}') into v_bad from unnest(new.module_ids) x
  where not exists (select 1 from public.modules m where m.id = x and m.kind = 'project');
  if array_length(v_bad, 1) > 0 then
    raise exception 'NOT_PROJECT_MODULE: %', array_to_string(v_bad, ', ') using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(new.folder_paths) p where p !~ '^[^/\\]{1,120}(/[^/\\]{1,120}){0,5}$') then
    raise exception 'BAD_FOLDER_PATH' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger project_templates_guard before insert or update on public.project_templates for each row execute function public.guard_project_template();

-- Apply a template: copies available modules and creates folders. Returns modules skipped as unavailable.
create or replace function public.apply_project_template(_project uuid, _template uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid; t record; m text; p text; seg text; v_parent uuid; v_id uuid; v_skipped text[] := '{}';
begin
  select tenant_id into v_tenant from public.projects where id = _project;
  if v_tenant is null or not public.can_manage_project(v_tenant, _project) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  select * into t from public.project_templates where id = _template and tenant_id = v_tenant and active;
  if not found then raise exception 'TEMPLATE_NOT_FOUND' using errcode = 'P0001'; end if;
  foreach m in array t.module_ids loop
    if public.module_enabled(v_tenant, m) then
      insert into public.project_modules (tenant_id, project_id, module_id, enabled)
      values (v_tenant, _project, m, true)
      on conflict (project_id, module_id) do update set enabled = true;
    else
      v_skipped := v_skipped || m;
    end if;
  end loop;
  foreach p in array t.folder_paths loop
    v_parent := null;
    foreach seg in array string_to_array(p, '/') loop
      select id into v_id from public.project_folders
      where project_id = _project and parent_id is not distinct from v_parent and lower(name) = lower(trim(seg));
      if v_id is null then
        insert into public.project_folders (tenant_id, project_id, parent_id, name)
        values (v_tenant, _project, v_parent, trim(seg)) returning id into v_id;
      end if;
      v_parent := v_id; v_id := null;
    end loop;
  end loop;
  update public.projects set template_id = _template where id = _project and template_id is distinct from _template;
  return v_skipped;
end $$;

-- ===== Shared record structure =====
create table public.project_record_counters (
  project_id uuid not null, module_id text not null, last_value integer not null default 0,
  primary key (project_id, module_id)
);
grant all on public.project_record_counters to service_role;
alter table public.project_record_counters enable row level security;

create table public.project_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  module_id text not null references public.modules(id),
  reference text not null default '',
  title text not null check (length(trim(title)) between 1 and 300),
  description text not null default '',
  status text not null default 'open' check (length(status) between 1 and 40),
  is_closed boolean not null default false,
  responsible_employee_id uuid,
  event_date date, due_date date, completed_on date,
  location text not null default '',
  fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1,
  foreign key (tenant_id, project_id) references public.projects (tenant_id, id) on delete restrict,
  foreign key (tenant_id, responsible_employee_id) references public.employees (tenant_id, id) on delete restrict,
  unique (tenant_id, id),
  unique (project_id, reference)
);
create index project_records_open_idx on public.project_records (project_id, is_closed, due_date);
grant select, insert, update on public.project_records to authenticated;
grant all on public.project_records to service_role;

create or replace function public.guard_project_record()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prefix text; v_n integer; v_code text;
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id <> old.tenant_id or new.project_id <> old.project_id or new.module_id <> old.module_id or new.reference <> old.reference then
      raise exception 'IMMUTABLE: record reference, project and module never change' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if not exists (select 1 from public.modules m where m.id = new.module_id and m.kind = 'project') then
    raise exception 'NOT_PROJECT_MODULE: %', new.module_id using errcode = 'P0001';
  end if;
  insert into public.project_record_counters (project_id, module_id, last_value) values (new.project_id, new.module_id, 1)
  on conflict (project_id, module_id) do update set last_value = public.project_record_counters.last_value + 1
  returning last_value into v_n;
  select reference into v_prefix from public.projects where id = new.project_id;
  v_code := upper(left(replace(new.module_id, '_', ''), 3));
  new.reference := v_prefix || '-' || v_code || '-' || lpad(v_n::text, 4, '0');
  return new;
end $$;
create trigger project_records_guard before insert or update on public.project_records for each row execute function public.guard_project_record();

alter table public.project_records enable row level security;
create policy "Project viewers see records of active modules; admins see historic"
  on public.project_records for select to authenticated using (
    public.can_view_project(tenant_id, project_id) and (
      public.project_module_active(tenant_id, project_id, module_id) or public.can_manage_project(tenant_id, project_id)));
create policy "Contributors add records to active modules"
  on public.project_records for insert to authenticated with check (
    public.can_contribute_project(tenant_id, project_id) and public.project_module_active(tenant_id, project_id, module_id));
create policy "Contributors change records in active modules"
  on public.project_records for update to authenticated
  using (public.can_contribute_project(tenant_id, project_id) and public.project_module_active(tenant_id, project_id, module_id))
  with check (public.can_contribute_project(tenant_id, project_id) and public.project_module_active(tenant_id, project_id, module_id));

create table public.record_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  from_record_id uuid not null,
  to_record_id uuid not null,
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  foreign key (tenant_id, from_record_id) references public.project_records (tenant_id, id) on delete restrict,
  foreign key (tenant_id, to_record_id) references public.project_records (tenant_id, id) on delete restrict,
  check (from_record_id <> to_record_id),
  unique (from_record_id, to_record_id)
);
grant select, insert, delete on public.record_links to authenticated;
grant all on public.record_links to service_role;
alter table public.record_links enable row level security;
-- A link is visible when the source record is visible; the target may be restricted, and the app explains that.
create policy "Viewers see links from visible records" on public.record_links for select to authenticated
  using (exists (select 1 from public.project_records r where r.id = from_record_id));
create policy "Contributors link records they can change" on public.record_links for insert to authenticated
  with check (
    exists (select 1 from public.project_records r where r.id = from_record_id
            and public.can_contribute_project(r.tenant_id, r.project_id) and public.project_module_active(r.tenant_id, r.project_id, r.module_id))
    and exists (select 1 from public.project_records r where r.id = to_record_id));
create policy "Contributors unlink records they can change" on public.record_links for delete to authenticated
  using (exists (select 1 from public.project_records r where r.id = from_record_id
            and public.can_contribute_project(r.tenant_id, r.project_id) and public.project_module_active(r.tenant_id, r.project_id, r.module_id)));

-- Describe a linked record without exposing restricted content.
create or replace function public.linked_record_summary(_record uuid)
returns table (record_id uuid, reference text, module_id text, title text, accessible boolean, restriction text)
language sql stable security definer set search_path = public as $$
  select r.id, r.reference, r.module_id,
    case when public.can_view_project(r.tenant_id, r.project_id) and public.project_module_active(r.tenant_id, r.project_id, r.module_id) then r.title end,
    public.can_view_project(r.tenant_id, r.project_id) and public.project_module_active(r.tenant_id, r.project_id, r.module_id),
    case
      when not public.can_view_project(r.tenant_id, r.project_id) then 'no_project_access'
      when not public.module_enabled(r.tenant_id, r.module_id) then 'module_off_for_business'
      when not public.project_module_active(r.tenant_id, r.project_id, r.module_id) then 'module_off_for_project'
    end
  from public.project_records r
  where r.id = _record and public.is_active_member(r.tenant_id)
$$;

create table public.record_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  record_id uuid not null,
  body text not null check (length(trim(body)) between 1 and 5000),
  author_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, record_id) references public.project_records (tenant_id, id) on delete restrict
);
grant select, insert on public.record_comments to authenticated;
grant all on public.record_comments to service_role;
alter table public.record_comments enable row level security;
create policy "Viewers see comments on visible records" on public.record_comments for select to authenticated
  using (exists (select 1 from public.project_records r where r.id = record_id));
create policy "Contributors comment on active records" on public.record_comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.project_records r where r.id = record_id
    and public.can_contribute_project(r.tenant_id, r.project_id) and public.project_module_active(r.tenant_id, r.project_id, r.module_id)));

-- ===== Recent activity for a project (audit, scoped) =====
create or replace function public.project_activity(_project uuid, _limit integer default 20)
returns table (occurred_at timestamptz, category text, action text, record_table text, actor_email text, summary text)
language sql stable security definer set search_path = public as $$
  select a.occurred_at, a.category, a.action, a.record_table, a.actor_email,
    coalesce(a.new_values->>'title', a.new_values->>'label', a.new_values->>'name', a.new_values->>'module_id', a.new_values->>'status', '')
  from public.audit_log a
  join public.projects p on p.id = _project
  where a.tenant_id = p.tenant_id
    and public.can_view_project(p.tenant_id, p.id)
    and a.category in ('project','project_detail')
    and (a.record_id = _project::text or a.new_values->>'project_id' = _project::text or a.old_values->>'project_id' = _project::text)
  order by a.occurred_at desc
  limit least(greatest(_limit, 1), 100)
$$;

-- ===== Stamps and audit =====
create trigger project_team_stamp_insert before insert on public.project_team for each row execute function public.stamp_insert();
create trigger project_team_stamp_update before update on public.project_team for each row execute function public.stamp_update();
create trigger project_orgs_stamp_insert before insert on public.project_organisations for each row execute function public.stamp_insert();
create trigger project_orgs_stamp_update before update on public.project_organisations for each row execute function public.stamp_update();
create trigger project_key_dates_stamp_insert before insert on public.project_key_dates for each row execute function public.stamp_insert();
create trigger project_key_dates_stamp_update before update on public.project_key_dates for each row execute function public.stamp_update();
create trigger project_folders_stamp_insert before insert on public.project_folders for each row execute function public.stamp_insert();
create trigger project_folders_stamp_update before update on public.project_folders for each row execute function public.stamp_update();
create trigger project_templates_stamp_insert before insert on public.project_templates for each row execute function public.stamp_insert();
create trigger project_templates_stamp_update before update on public.project_templates for each row execute function public.stamp_update();
create trigger project_records_stamp_insert before insert on public.project_records for each row execute function public.stamp_insert();
create trigger project_records_stamp_update before update on public.project_records for each row execute function public.stamp_update();

create trigger project_team_audit after insert or update or delete on public.project_team for each row execute function public.write_audit('project_detail');
create trigger project_orgs_audit after insert or update or delete on public.project_organisations for each row execute function public.write_audit('project_detail');
create trigger project_key_dates_audit after insert or update or delete on public.project_key_dates for each row execute function public.write_audit('project_detail');
create trigger project_modules_audit after insert or update on public.project_modules for each row execute function public.write_audit('project_detail');
create trigger project_folders_audit after insert or update on public.project_folders for each row execute function public.write_audit('project_detail');
create trigger project_templates_audit after insert or update on public.project_templates for each row execute function public.write_audit('template');
create trigger project_records_audit after insert or update on public.project_records for each row execute function public.write_audit('project_detail');
create trigger record_links_audit after insert or delete on public.record_links for each row execute function public.write_audit('project_detail');
create trigger record_comments_audit after insert on public.record_comments for each row execute function public.write_audit('project_detail');

-- ===== Function privileges =====
revoke execute on function public.guard_project_module(), public.guard_project_template(), public.guard_project_record() from public, anon, authenticated;
revoke execute on function
  public.project_role_of(uuid, uuid), public.can_manage_project(uuid, uuid), public.can_view_project(uuid, uuid),
  public.can_contribute_project(uuid, uuid), public.project_module_active(uuid, uuid, text),
  public.apply_project_template(uuid, uuid), public.linked_record_summary(uuid), public.project_activity(uuid, integer)
from public, anon;
grant execute on function
  public.project_role_of(uuid, uuid), public.can_manage_project(uuid, uuid), public.can_view_project(uuid, uuid),
  public.can_contribute_project(uuid, uuid), public.project_module_active(uuid, uuid, text),
  public.apply_project_template(uuid, uuid), public.linked_record_summary(uuid), public.project_activity(uuid, integer)
to authenticated, service_role;