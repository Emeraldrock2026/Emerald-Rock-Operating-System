update public.modules set built = true where id in ('progress_reports','delay_reports');

alter table public.project_files drop constraint project_files_module_id_check;
alter table public.project_files add constraint project_files_module_id_check
  check (module_id = any (array['photos','documents','drawings','progress_reports','delay_reports']));

create or replace function public.project_file_path_parts(_name text)
returns table(tenant_id uuid, project_id uuid, module_id text, file_id uuid)
language sql immutable set search_path to 'public' as $$
  select (p[1])::uuid, (p[2])::uuid, p[3], (p[4])::uuid
  from (select string_to_array(_name, '/') p) s
  where array_length(p,1) = 5
    and p[1] ~ '^[0-9a-f-]{36}$' and p[2] ~ '^[0-9a-f-]{36}$' and p[4] ~ '^[0-9a-f-]{36}$'
    and p[3] in ('photos','documents','drawings','progress_reports','delay_reports')
$$;

-- Issued report copies: one row per issue, never edited or deleted.
create table public.report_issues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  project_id uuid not null,
  record_id uuid not null,
  module_id text not null check (module_id in ('progress_reports','delay_reports')),
  issue_no integer not null check (issue_no >= 1),
  content_hash text not null check (length(content_hash) between 16 and 128),
  snapshot jsonb not null,
  file_id uuid not null,
  file_version integer not null,
  note text not null default '' check (length(note) <= 1000),
  issued_by uuid not null,
  issued_at timestamptz not null default now(),
  unique (record_id, issue_no),
  unique (file_id, file_version),
  unique (tenant_id, id),
  foreign key (tenant_id, project_id) references public.projects(tenant_id, id),
  foreign key (tenant_id, record_id) references public.project_records(tenant_id, id)
);
create index report_issues_record_idx on public.report_issues(record_id, issue_no desc);
grant select on public.report_issues to authenticated;
grant all on public.report_issues to service_role;
alter table public.report_issues enable row level security;
create policy "Report issues visible to project viewers" on public.report_issues for select to authenticated
  using (public.can_view_project(tenant_id, project_id)
    and (public.project_module_active(tenant_id, project_id, module_id) or public.can_manage_project(tenant_id, project_id)));

-- Issue a report: project admins only, module on, record unchanged since the user loaded it,
-- PDF already stored for this project and module, and not an identical repeat of the last issue.
create or replace function public.issue_project_report(_record uuid, _expected_version integer, _file uuid, _file_version integer, _hash text, _snapshot jsonb, _note text default '')
returns integer language plpgsql security definer set search_path to 'public' as $$
declare r record; v_no integer; v_last text;
begin
  select * into r from public.project_records where id = _record for update;
  if r.id is null or r.module_id not in ('progress_reports','delay_reports') then raise exception 'NOT_FOUND'; end if;
  if not public.can_manage_project(r.tenant_id, r.project_id) then raise exception 'NOT_ALLOWED'; end if;
  if not public.project_module_active(r.tenant_id, r.project_id, r.module_id) then raise exception 'MODULE_NOT_ACTIVE'; end if;
  if r.version <> _expected_version then raise exception 'STALE_EDIT'; end if;
  if not exists (select 1 from public.project_files f join public.project_file_versions v on v.file_id = f.id
      where f.id = _file and v.version_no = _file_version and f.project_id = r.project_id and f.module_id = r.module_id and v.mime_type = 'application/pdf') then
    raise exception 'BAD_FILE_PATH';
  end if;
  select content_hash into v_last from public.report_issues where record_id = _record order by issue_no desc limit 1;
  if v_last = _hash then raise exception 'DUPLICATE_ISSUE'; end if;
  select coalesce(max(issue_no), 0) + 1 into v_no from public.report_issues where record_id = _record;
  insert into public.report_issues (tenant_id, project_id, record_id, module_id, issue_no, content_hash, snapshot, file_id, file_version, note, issued_by)
  values (r.tenant_id, r.project_id, _record, r.module_id, v_no, _hash, coalesce(_snapshot, '{}'::jsonb), _file, _file_version, left(coalesce(_note, ''), 1000), auth.uid());
  update public.project_records set status = 'issued' where id = _record;
  return v_no;
end $$;
revoke all on function public.issue_project_report(uuid, integer, uuid, integer, text, jsonb, text) from public, anon;
grant execute on function public.issue_project_report(uuid, integer, uuid, integer, text, jsonb, text) to authenticated;