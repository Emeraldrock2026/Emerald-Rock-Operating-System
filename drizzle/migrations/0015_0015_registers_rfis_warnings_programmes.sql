update public.modules set built = true where id in ('rfis','early_warnings','programmes');

alter table public.project_files drop constraint project_files_module_id_check;
alter table public.project_files add constraint project_files_module_id_check
  check (module_id = any (array['photos','documents','drawings','progress_reports','delay_reports','programmes']));

create or replace function public.project_file_path_parts(_name text)
returns table(tenant_id uuid, project_id uuid, module_id text, file_id uuid)
language sql immutable set search_path to 'public' as $$
  select (p[1])::uuid, (p[2])::uuid, p[3], (p[4])::uuid
  from (select string_to_array(_name, '/') p) s
  where array_length(p,1) = 5
    and p[1] ~ '^[0-9a-f-]{36}$' and p[2] ~ '^[0-9a-f-]{36}$' and p[4] ~ '^[0-9a-f-]{36}$'
    and p[3] in ('photos','documents','drawings','progress_reports','delay_reports','programmes')
$$;

-- Status rules for RFIs, early warnings and programmes. Mirrors src/lib/domain/registers.ts.
create or replace function public.guard_register_record()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_allowed text[]; v_closed text[]; v_admin_only text[]; v_manage boolean;
  v_old text := case when tg_op = 'UPDATE' then old.status else null end;
begin
  if new.module_id not in ('rfis','early_warnings','programmes') then return new; end if;
  if new.module_id = 'rfis' then v_allowed := array['draft','open','responded','closed']; v_closed := array['closed']; v_admin_only := array['closed'];
  elsif new.module_id = 'early_warnings' then v_allowed := array['open','under_review','closed']; v_closed := array['closed']; v_admin_only := array['closed'];
  else v_allowed := array['draft','submitted','current','superseded']; v_closed := array['superseded']; v_admin_only := array['current','superseded'];
  end if;
  if tg_op = 'INSERT' and new.status = 'draft' and new.module_id = 'early_warnings' then new.status := 'open'; end if;
  if not (new.status = any (v_allowed)) then raise exception 'BAD_STATUS'; end if;
  new.is_closed := new.status = any (v_closed);
  if new.module_id = 'rfis' and new.status in ('responded','closed') and coalesce(trim(new.fields->>'response'), '') = '' then
    raise exception 'RESPONSE_REQUIRED';
  end if;
  if new.module_id = 'programmes' and coalesce(new.fields->>'file_id', '') <> '' then
    if not exists (select 1 from public.project_files f where f.id::text = new.fields->>'file_id' and f.project_id = new.project_id and f.module_id = 'programmes') then
      raise exception 'BAD_FILE_PATH';
    end if;
  end if;
  if new.module_id = 'programmes' and new.status = 'current' and coalesce(new.fields->>'file_id', '') = '' then
    raise exception 'PROGRAMME_FILE_REQUIRED';
  end if;
  -- Closing, reopening, accepting or superseding is for project admins (the service itself is exempt).
  if auth.uid() is not null and new.status is distinct from v_old
     and (new.status = any (v_admin_only) or v_old = any (v_admin_only)) then
    v_manage := public.can_manage_project(new.tenant_id, new.project_id);
    if not v_manage then raise exception 'ADMIN_ONLY_STATUS'; end if;
  end if;
  if new.module_id = 'rfis' and new.status = 'closed' and new.completed_on is null then new.completed_on := current_date; end if;
  if new.module_id = 'rfis' and new.status <> 'closed' then new.completed_on := null; end if;
  return new;
end $$;
create trigger guard_register_record before insert or update on public.project_records
  for each row execute function public.guard_register_record();

-- Only one current programme per project: making one current supersedes the previous one.
create or replace function public.supersede_programmes()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.module_id = 'programmes' and new.status = 'current' and (tg_op = 'INSERT' or old.status is distinct from 'current') then
    update public.project_records set status = 'superseded'
    where project_id = new.project_id and module_id = 'programmes' and status = 'current' and id <> new.id;
  end if;
  return null;
end $$;
create trigger supersede_programmes after insert or update of status on public.project_records
  for each row execute function public.supersede_programmes();