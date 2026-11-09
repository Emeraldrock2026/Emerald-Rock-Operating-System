update public.modules set built = true where id in ('qa','handover','rams','deliveries','procurement','assets_plant');

alter table public.project_files drop constraint project_files_module_id_check;
alter table public.project_files add constraint project_files_module_id_check
  check (module_id = any (array['photos','documents','drawings','progress_reports','delay_reports','programmes','handover','rams']));

create or replace function public.project_file_path_parts(_name text)
returns table(tenant_id uuid, project_id uuid, module_id text, file_id uuid)
language sql immutable set search_path to 'public' as $$
  select (p[1])::uuid, (p[2])::uuid, p[3], (p[4])::uuid
  from (select string_to_array(_name, '/') p) s
  where array_length(p,1) = 5
    and p[1] ~ '^[0-9a-f-]{36}$' and p[2] ~ '^[0-9a-f-]{36}$' and p[4] ~ '^[0-9a-f-]{36}$'
    and p[3] in ('photos','documents','drawings','progress_reports','delay_reports','programmes','handover','rams')
$$;

-- Status rules for every register-style project module. Mirrors src/lib/domain/registers.ts.
create or replace function public.guard_register_record()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_allowed text[]; v_closed text[]; v_admin_only text[]; v_file_required text[]; v_file_locked text[] := '{}';
  v_old text := case when tg_op = 'UPDATE' then old.status else null end;
  m text := new.module_id;
begin
  if m not in ('rfis','early_warnings','programmes','qa','handover','rams','deliveries','procurement','assets_plant') then return new; end if;
  if m = 'rfis' then v_allowed := array['draft','open','responded','closed']; v_closed := array['closed']; v_admin_only := array['closed'];
  elsif m = 'early_warnings' then v_allowed := array['open','under_review','closed']; v_closed := array['closed']; v_admin_only := array['closed'];
  elsif m = 'programmes' then v_allowed := array['draft','submitted','current','superseded']; v_closed := array['superseded']; v_admin_only := array['current','superseded'];
    v_file_required := array['current']; v_file_locked := array['current','superseded'];
  elsif m = 'qa' then v_allowed := array['open','passed','failed','closed']; v_closed := array['closed']; v_admin_only := array['closed'];
  elsif m = 'handover' then v_allowed := array['not_started','in_progress','submitted','accepted']; v_closed := array['accepted']; v_admin_only := array['accepted'];
    v_file_required := array['submitted','accepted']; v_file_locked := array['accepted'];
  elsif m = 'rams' then v_allowed := array['draft','submitted','approved','rejected','superseded']; v_closed := array['rejected','superseded']; v_admin_only := array['approved','rejected','superseded'];
    v_file_required := array['submitted','approved']; v_file_locked := array['approved','superseded'];
  elsif m = 'deliveries' then v_allowed := array['expected','delivered','cancelled']; v_closed := array['delivered','cancelled']; v_admin_only := array['cancelled'];
  elsif m = 'procurement' then v_allowed := array['planning','tendering','awarded','ordered','closed']; v_closed := array['closed']; v_admin_only := array['awarded','closed'];
  else v_allowed := array['on_site','off_hired']; v_closed := array['off_hired']; v_admin_only := '{}';
  end if;
  if tg_op = 'INSERT' and new.status = 'draft' and m = 'early_warnings' then new.status := 'open'; end if;
  if not (new.status = any (v_allowed)) then raise exception 'BAD_STATUS'; end if;
  new.is_closed := new.status = any (v_closed);
  if m = 'rfis' and new.status in ('responded','closed') and coalesce(trim(new.fields->>'response'), '') = '' then raise exception 'RESPONSE_REQUIRED'; end if;
  if m = 'qa' and new.status in ('passed','failed') and coalesce(trim(new.fields->>'result'), '') = '' then raise exception 'RESULT_REQUIRED'; end if;
  if m = 'procurement' and new.status in ('awarded','ordered') and coalesce(trim(new.fields->>'supplier'), '') = '' then raise exception 'SUPPLIER_REQUIRED'; end if;
  if m in ('programmes','handover','rams') and coalesce(new.fields->>'file_id', '') <> '' then
    if not exists (select 1 from public.project_files f where f.id::text = new.fields->>'file_id' and f.project_id = new.project_id and f.module_id = m) then
      raise exception 'BAD_FILE_PATH';
    end if;
  end if;
  if m = 'programmes' and new.status = 'current' and coalesce(new.fields->>'file_id', '') = '' then raise exception 'PROGRAMME_FILE_REQUIRED'; end if;
  if new.status = any (coalesce(v_file_required, '{}')) and coalesce(new.fields->>'file_id', '') = '' then raise exception 'FILE_REQUIRED'; end if;
  -- An accepted, approved or current document can't have its file swapped underneath it.
  if tg_op = 'UPDATE' and old.status = any (v_file_locked) and new.status = old.status
     and ((new.fields->>'file_id') is distinct from (old.fields->>'file_id') or (new.fields->>'file_version') is distinct from (old.fields->>'file_version')) then
    raise exception 'FILE_LOCKED';
  end if;
  if auth.uid() is not null and new.status is distinct from v_old
     and (new.status = any (v_admin_only) or v_old = any (v_admin_only)) then
    if not public.can_manage_project(new.tenant_id, new.project_id) then raise exception 'ADMIN_ONLY_STATUS'; end if;
  end if;
  if m <> 'programmes' then
    if new.is_closed and new.completed_on is null then new.completed_on := current_date; end if;
    if not new.is_closed then new.completed_on := null; end if;
  end if;
  return new;
end $$;