create or replace function public.record_reference_code(_module text)
returns text language sql immutable set search_path to 'public' as $$
  select case _module
    when 'progress_reports' then 'PRO' when 'delay_reports' then 'DEL' when 'change_control' then 'CHA' when 'drawings' then 'DRA'
    when 'programmes' then 'PRG' when 'procurement' then 'PCM' when 'deliveries' then 'DLV' when 'rfis' then 'RFI'
    when 'early_warnings' then 'EW' when 'qa' then 'QA' when 'handover' then 'HND' when 'rams' then 'RAMS'
    when 'assets_plant' then 'AST' when 'photos' then 'PHO' when 'documents' then 'DOC'
    else upper(left(replace(_module, '_', ''), 3)) end
$$;

create or replace function public.guard_project_record()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_prefix text; v_n integer;
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
  new.reference := v_prefix || '-' || public.record_reference_code(new.module_id) || '-' || lpad(v_n::text, 4, '0');
  return new;
end $$;