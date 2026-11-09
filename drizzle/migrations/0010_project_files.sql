update public.modules set built = true where id in ('photos','documents');

create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  module_id text not null references public.modules(id) check (module_id in ('photos','documents')),
  folder_id uuid,
  title text not null check (length(trim(title)) between 1 and 200),
  caption text not null default '' check (length(caption) <= 2000),
  tags text[] not null default '{}',
  current_version integer not null default 0,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1,
  unique (tenant_id, id),
  foreign key (tenant_id, project_id) references public.projects (tenant_id, id) on delete restrict,
  foreign key (tenant_id, folder_id) references public.project_folders (tenant_id, id) on delete restrict
);
create index project_files_project_idx on public.project_files (project_id, module_id, folder_id);
grant select, update on public.project_files to authenticated;
grant all on public.project_files to service_role;
alter table public.project_files enable row level security;
create policy "Project viewers see files in active modules" on public.project_files for select to authenticated using (
  public.can_view_project(tenant_id, project_id) and (
    public.project_module_active(tenant_id, project_id, module_id) or public.can_manage_project(tenant_id, project_id)));
create policy "Contributors edit file details" on public.project_files for update to authenticated
  using (public.can_contribute_project(tenant_id, project_id) and public.project_module_active(tenant_id, project_id, module_id))
  with check (public.can_contribute_project(tenant_id, project_id) and public.project_module_active(tenant_id, project_id, module_id));

create table public.project_file_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  file_id uuid not null,
  version_no integer not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  note text not null default '',
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),
  unique (file_id, version_no),
  foreign key (tenant_id, file_id) references public.project_files (tenant_id, id) on delete restrict
);
grant select on public.project_file_versions to authenticated;
grant all on public.project_file_versions to service_role;
alter table public.project_file_versions enable row level security;
create policy "Versions follow file visibility" on public.project_file_versions for select to authenticated
  using (exists (select 1 from public.project_files f where f.id = file_id));

create or replace function public.guard_project_file() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.project_id <> old.project_id or new.module_id <> old.module_id or new.tenant_id <> old.tenant_id then
      raise exception 'FILE_IMMUTABLE_FIELDS';
    end if;
    if new.current_version <> old.current_version and current_setting('app.file_version_write', true) is distinct from 'on' then
      raise exception 'FILE_VERSION_DIRECT';
    end if;
  end if;
  if new.folder_id is not null and not exists (select 1 from public.project_folders pf where pf.id = new.folder_id and pf.project_id = new.project_id) then
    raise exception 'FOLDER_NOT_IN_PROJECT';
  end if;
  new.tags := coalesce((select array_agg(distinct lower(trim(t))) from unnest(new.tags) t where length(trim(t)) between 1 and 40), '{}');
  return new;
end $$;
create trigger project_files_guard before insert or update on public.project_files for each row execute function public.guard_project_file();
create trigger project_files_stamp_insert before insert on public.project_files for each row execute function public.stamp_insert();
create trigger project_files_stamp_update before update on public.project_files for each row execute function public.stamp_update();
create trigger project_files_audit after insert or update on public.project_files for each row execute function public.write_audit('project_detail');
create trigger project_file_versions_audit after insert on public.project_file_versions for each row execute function public.write_audit('project_detail');

create or replace function public.project_file_path_parts(_name text)
returns table(tenant_id uuid, project_id uuid, module_id text, file_id uuid) language sql immutable set search_path = public as $$
  select (p[1])::uuid, (p[2])::uuid, p[3], (p[4])::uuid
  from (select string_to_array(_name, '/') p) s
  where array_length(p,1) = 5
    and p[1] ~ '^[0-9a-f-]{36}$' and p[2] ~ '^[0-9a-f-]{36}$' and p[4] ~ '^[0-9a-f-]{36}$'
    and p[3] in ('photos','documents')
$$;

create or replace function public.can_read_project_file_object(_name text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.can_view_project(x.tenant_id, x.project_id) and (
    public.project_module_active(x.tenant_id, x.project_id, x.module_id) or public.can_manage_project(x.tenant_id, x.project_id))
    from public.project_file_path_parts(_name) x), false)
$$;
create or replace function public.can_write_project_file_object(_name text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.can_contribute_project(x.tenant_id, x.project_id) and public.project_module_active(x.tenant_id, x.project_id, x.module_id)
    from public.project_file_path_parts(_name) x), false)
$$;

create policy "Project viewers read project files" on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and public.can_read_project_file_object(name));
create policy "Contributors upload project files" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and public.can_write_project_file_object(name));

create or replace function public.record_project_file_version(
  _file uuid, _project uuid, _module text, _path text, _file_name text, _mime text, _size bigint, _note text default '',
  _title text default null, _caption text default '', _tags text[] default '{}', _folder uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid; v_parts record; v_next integer; v_exists boolean;
begin
  select tenant_id into v_tenant from public.projects where id = _project;
  if v_tenant is null or not public.can_contribute_project(v_tenant, _project) then raise exception 'NOT_ALLOWED'; end if;
  if not public.project_module_active(v_tenant, _project, _module) then raise exception 'MODULE_NOT_ACTIVE'; end if;
  select * into v_parts from public.project_file_path_parts(_path);
  if v_parts.tenant_id is null or v_parts.tenant_id <> v_tenant or v_parts.project_id <> _project or v_parts.module_id <> _module or v_parts.file_id <> _file then
    raise exception 'BAD_FILE_PATH';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'project-files' and o.name = _path) then
    raise exception 'UPLOAD_MISSING';
  end if;
  perform set_config('app.file_version_write', 'on', true);
  select true into v_exists from public.project_files where id = _file;
  if v_exists then
    if not exists (select 1 from public.project_files where id = _file and project_id = _project and module_id = _module) then raise exception 'BAD_FILE_PATH'; end if;
    update public.project_files set current_version = current_version + 1 where id = _file returning current_version into v_next;
  else
    insert into public.project_files (id, tenant_id, project_id, module_id, folder_id, title, caption, tags, current_version)
    values (_file, v_tenant, _project, _module, _folder, coalesce(nullif(trim(_title), ''), _file_name), coalesce(_caption, ''), coalesce(_tags, '{}'), 1);
    v_next := 1;
  end if;
  insert into public.project_file_versions (tenant_id, file_id, version_no, storage_path, file_name, mime_type, size_bytes, note, uploaded_by)
  values (v_tenant, _file, v_next, _path, left(_file_name, 255), coalesce(nullif(_mime, ''), 'application/octet-stream'), coalesce(_size, 0), coalesce(_note, ''), auth.uid());
  perform set_config('app.file_version_write', 'off', true);
  return v_next;
end $$;
revoke execute on function public.record_project_file_version(uuid,uuid,text,text,text,text,bigint,text,text,text,text[],uuid) from public, anon;
grant execute on function public.record_project_file_version(uuid,uuid,text,text,text,text,bigint,text,text,text,text[],uuid) to authenticated;
revoke execute on function public.can_read_project_file_object(text), public.can_write_project_file_object(text) from public, anon;
grant execute on function public.can_read_project_file_object(text), public.can_write_project_file_object(text) to authenticated;

create policy "Contributors add folders for files" on public.project_folders for insert to authenticated with check (
  public.can_contribute_project(tenant_id, project_id) and (
    public.project_module_active(tenant_id, project_id, 'photos') or public.project_module_active(tenant_id, project_id, 'documents')));