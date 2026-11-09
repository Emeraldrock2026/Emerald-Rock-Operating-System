update public.modules set built = true where id = 'drawings';

alter table public.project_files drop constraint project_files_module_id_check;
alter table public.project_files add constraint project_files_module_id_check check (module_id in ('photos','documents','drawings'));

create or replace function public.project_file_path_parts(_name text)
returns table(tenant_id uuid, project_id uuid, module_id text, file_id uuid) language sql immutable set search_path = public as $$
  select (p[1])::uuid, (p[2])::uuid, p[3], (p[4])::uuid
  from (select string_to_array(_name, '/') p) s
  where array_length(p,1) = 5
    and p[1] ~ '^[0-9a-f-]{36}$' and p[2] ~ '^[0-9a-f-]{36}$' and p[4] ~ '^[0-9a-f-]{36}$'
    and p[3] in ('photos','documents','drawings')
$$;

create table public.drawing_register_settings (
  project_id uuid primary key,
  tenant_id uuid not null,
  series text[] not null default '{P,C}',
  digits integer not null default 2 check (digits between 1 and 3),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1,
  foreign key (tenant_id, project_id) references public.projects (tenant_id, id) on delete restrict,
  check (array_length(series, 1) between 1 and 6)
);
grant select, insert, update on public.drawing_register_settings to authenticated;
grant all on public.drawing_register_settings to service_role;
alter table public.drawing_register_settings enable row level security;
create policy "Project viewers see drawing settings" on public.drawing_register_settings for select to authenticated using (public.can_view_project(tenant_id, project_id));
create policy "Project admins add drawing settings" on public.drawing_register_settings for insert to authenticated with check (public.can_manage_project(tenant_id, project_id) and public.project_module_active(tenant_id, project_id, 'drawings'));
create policy "Project admins change drawing settings" on public.drawing_register_settings for update to authenticated
  using (public.can_manage_project(tenant_id, project_id) and public.project_module_active(tenant_id, project_id, 'drawings'))
  with check (public.can_manage_project(tenant_id, project_id) and public.project_module_active(tenant_id, project_id, 'drawings'));
create trigger drawing_settings_stamp_insert before insert on public.drawing_register_settings for each row execute function public.stamp_insert();
create trigger drawing_settings_stamp_update before update on public.drawing_register_settings for each row execute function public.stamp_update();
create trigger drawing_settings_audit after insert or update on public.drawing_register_settings for each row execute function public.write_audit('project_detail');

-- Mirrors src/lib/domain/drawings.ts parseRevision: rank = series index * 10000 + number; null when outside the sequence.
create or replace function public.drawing_revision_rank(_code text, _series text[], _digits integer)
returns integer language plpgsql immutable set search_path = public as $$
declare c text := upper(trim(_code)); i integer; p text; m text[];
begin
  for i in 1 .. coalesce(array_length(_series, 1), 0) loop
    p := upper(_series[i]);
    if p = 'A-Z' then
      if c ~ '^[A-Z]$' then return (i - 1) * 10000 + ascii(c) - 64; end if;
    else
      m := regexp_match(c, '^' || regexp_replace(p, '[^A-Z0-9]', '', 'g') || '([0-9]{' || _digits || '})$');
      if m is not null and m[1]::int >= 1 then return (i - 1) * 10000 + m[1]::int; end if;
    end if;
  end loop;
  return null;
end $$;

create table public.drawing_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  record_id uuid not null,
  revision text not null,
  rank integer not null,
  revision_date date not null,
  received_on date not null,
  purpose text not null default '',
  note text not null default '',
  file_id uuid not null,
  file_version integer not null,
  authorised boolean not null default false,
  authorised_by uuid,
  authorised_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1,
  unique (tenant_id, id),
  unique (record_id, revision),
  foreign key (tenant_id, record_id) references public.project_records (tenant_id, id) on delete restrict,
  foreign key (tenant_id, file_id) references public.project_files (tenant_id, id) on delete restrict,
  foreign key (tenant_id, project_id) references public.projects (tenant_id, id) on delete restrict
);
create unique index drawing_revisions_one_authorised on public.drawing_revisions (record_id) where authorised;
create index drawing_revisions_project_idx on public.drawing_revisions (project_id, revision_date);
grant select on public.drawing_revisions to authenticated;
grant all on public.drawing_revisions to service_role;
alter table public.drawing_revisions enable row level security;
create policy "Revisions follow drawing visibility" on public.drawing_revisions for select to authenticated
  using (exists (select 1 from public.project_records r where r.id = record_id));
create trigger drawing_revisions_stamp_insert before insert on public.drawing_revisions for each row execute function public.stamp_insert();
create trigger drawing_revisions_stamp_update before update on public.drawing_revisions for each row execute function public.stamp_update();
create trigger drawing_revisions_audit after insert or update on public.drawing_revisions for each row execute function public.write_audit('project_detail');

create unique index project_records_drawing_number_idx on public.project_records (project_id, lower(fields->>'number')) where module_id = 'drawings';

create or replace function public.add_drawing_revision(
  _record uuid, _revision text, _revision_date date, _file uuid, _file_version integer, _purpose text default '', _note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.project_records; s_series text[]; s_digits integer; v_rank integer; v_max integer; v_id uuid;
begin
  select * into r from public.project_records where id = _record;
  if r.id is null or r.module_id <> 'drawings' then raise exception 'NOT_A_DRAWING'; end if;
  if not public.can_contribute_project(r.tenant_id, r.project_id) then raise exception 'NOT_ALLOWED'; end if;
  if not public.project_module_active(r.tenant_id, r.project_id, 'drawings') then raise exception 'MODULE_NOT_ACTIVE'; end if;
  if not exists (select 1 from public.project_files f join public.project_file_versions v on v.file_id = f.id
                 where f.id = _file and f.project_id = r.project_id and f.module_id = 'drawings' and v.version_no = _file_version) then
    raise exception 'BAD_FILE_PATH';
  end if;
  select series, digits into s_series, s_digits from public.drawing_register_settings where project_id = r.project_id;
  s_series := coalesce(s_series, '{P,C}'); s_digits := coalesce(s_digits, 2);
  v_rank := public.drawing_revision_rank(_revision, s_series, s_digits);
  if v_rank is null then raise exception 'REVISION_OUT_OF_SEQUENCE'; end if;
  select max(rank) into v_max from public.drawing_revisions where record_id = _record;
  if v_max is not null and v_rank <= v_max then raise exception 'REVISION_NOT_LATER'; end if;
  insert into public.drawing_revisions (tenant_id, project_id, record_id, revision, rank, revision_date, received_on, purpose, note, file_id, file_version)
  values (r.tenant_id, r.project_id, _record, upper(trim(_revision)), v_rank, _revision_date, public.tenant_today(r.tenant_id), coalesce(_purpose, ''), coalesce(_note, ''), _file, _file_version)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.set_drawing_authorised(_revision uuid, _authorised boolean)
returns void language plpgsql security definer set search_path = public as $$
declare d public.drawing_revisions;
begin
  select * into d from public.drawing_revisions where id = _revision;
  if d.id is null then raise exception 'NOT_FOUND'; end if;
  if not public.can_manage_project(d.tenant_id, d.project_id) then raise exception 'NOT_ALLOWED'; end if;
  if not public.project_module_active(d.tenant_id, d.project_id, 'drawings') then raise exception 'MODULE_NOT_ACTIVE'; end if;
  if _authorised then
    update public.drawing_revisions set authorised = false, authorised_by = null, authorised_at = null where record_id = d.record_id and authorised and id <> d.id;
    update public.drawing_revisions set authorised = true, authorised_by = auth.uid(), authorised_at = now() where id = d.id;
  else
    update public.drawing_revisions set authorised = false, authorised_by = null, authorised_at = null where id = d.id;
  end if;
end $$;

revoke execute on function public.add_drawing_revision(uuid,text,date,uuid,integer,text,text), public.set_drawing_authorised(uuid,boolean) from public, anon;
grant execute on function public.add_drawing_revision(uuid,text,date,uuid,integer,text,text), public.set_drawing_authorised(uuid,boolean) to authenticated;