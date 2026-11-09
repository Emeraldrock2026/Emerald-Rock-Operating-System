update public.modules set built = true where id = 'change_control';

create table public.drawing_comparisons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  record_id uuid not null,
  from_revision_id uuid not null,
  to_revision_id uuid not null,
  status text not null check (status in ('completed','failed')),
  finding_count integer not null default 0,
  new_count integer not null default 0,
  error text,
  model text not null default '',
  ran_by uuid,
  ran_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, record_id) references public.project_records (tenant_id, id) on delete restrict,
  foreign key (tenant_id, from_revision_id) references public.drawing_revisions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, to_revision_id) references public.drawing_revisions (tenant_id, id) on delete restrict,
  check (from_revision_id <> to_revision_id)
);
create index drawing_comparisons_record_idx on public.drawing_comparisons (record_id, ran_at desc);
grant select on public.drawing_comparisons to authenticated;
grant all on public.drawing_comparisons to service_role;
alter table public.drawing_comparisons enable row level security;
create policy "Comparisons follow drawing visibility" on public.drawing_comparisons for select to authenticated
  using (exists (select 1 from public.project_records r where r.id = record_id));

create table public.comparison_findings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  record_id uuid not null,
  from_revision_id uuid not null,
  to_revision_id uuid not null,
  fingerprint text not null,
  category text not null,
  location text not null default '',
  summary text not null,
  first_comparison_id uuid not null,
  last_seen_comparison_id uuid not null,
  decision text not null default 'proposed' check (decision in ('proposed','accepted','amended','rejected')),
  amended_summary text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  change_record_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  version integer not null default 1,
  unique (from_revision_id, to_revision_id, fingerprint),
  foreign key (tenant_id, record_id) references public.project_records (tenant_id, id) on delete restrict,
  foreign key (tenant_id, change_record_id) references public.project_records (tenant_id, id) on delete restrict,
  foreign key (tenant_id, first_comparison_id) references public.drawing_comparisons (tenant_id, id) on delete restrict,
  foreign key (tenant_id, last_seen_comparison_id) references public.drawing_comparisons (tenant_id, id) on delete restrict
);
create index comparison_findings_change_idx on public.comparison_findings (change_record_id);
grant select on public.comparison_findings to authenticated;
grant all on public.comparison_findings to service_role;
alter table public.comparison_findings enable row level security;
create policy "Findings follow drawing visibility" on public.comparison_findings for select to authenticated
  using (exists (select 1 from public.project_records r where r.id = record_id));
create trigger comparison_findings_stamp_insert before insert on public.comparison_findings for each row execute function public.stamp_insert();
create trigger comparison_findings_stamp_update before update on public.comparison_findings for each row execute function public.stamp_update();
create trigger comparison_findings_audit after insert or update on public.comparison_findings for each row execute function public.write_audit('project_detail');
create trigger drawing_comparisons_audit after insert on public.drawing_comparisons for each row execute function public.write_audit('project_detail');

-- Checked by the server before it calls the model (signed-in user's own rights).
create or replace function public.can_compare_drawing(_record uuid, _from uuid, _to uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.can_contribute_project(r.tenant_id, r.project_id) and public.project_module_active(r.tenant_id, r.project_id, 'drawings')
      and exists (select 1 from public.drawing_revisions a where a.id = _from and a.record_id = r.id)
      and exists (select 1 from public.drawing_revisions b where b.id = _to and b.record_id = r.id)
      and _from <> _to
    from public.project_records r where r.id = _record and r.module_id = 'drawings'), false)
$$;
revoke execute on function public.can_compare_drawing(uuid,uuid,uuid) from public, anon;
grant execute on function public.can_compare_drawing(uuid,uuid,uuid) to authenticated, service_role;

-- Server-only: stores a comparison run and merges its findings; reruns never duplicate a finding.
create or replace function public.save_drawing_comparison(_actor uuid, _record uuid, _from uuid, _to uuid, _status text, _error text, _model text, _findings jsonb)
returns table (comparison_id uuid, finding_count integer, new_count integer)
language plpgsql security definer set search_path = public as $$
declare r public.project_records; v_id uuid; v_total integer := 0; v_new integer := 0; f jsonb; v_inserted boolean;
begin
  select * into r from public.project_records where id = _record and module_id = 'drawings';
  if r.id is null then raise exception 'NOT_A_DRAWING'; end if;
  if not exists (select 1 from public.drawing_revisions where id = _from and record_id = _record)
     or not exists (select 1 from public.drawing_revisions where id = _to and record_id = _record) then raise exception 'NOT_FOUND'; end if;
  insert into public.drawing_comparisons (tenant_id, project_id, record_id, from_revision_id, to_revision_id, status, error, model, ran_by)
  values (r.tenant_id, r.project_id, _record, _from, _to, _status, _error, coalesce(_model, ''), _actor) returning id into v_id;
  if _status = 'completed' then
    for f in select * from jsonb_array_elements(coalesce(_findings, '[]'::jsonb)) loop
      v_total := v_total + 1;
      insert into public.comparison_findings (tenant_id, project_id, record_id, from_revision_id, to_revision_id, fingerprint, category, location, summary, first_comparison_id, last_seen_comparison_id, created_by, updated_by)
      values (r.tenant_id, r.project_id, _record, _from, _to, f->>'fingerprint', f->>'category', coalesce(f->>'location', ''), f->>'summary', v_id, v_id, _actor, _actor)
      on conflict (from_revision_id, to_revision_id, fingerprint) do update set last_seen_comparison_id = excluded.last_seen_comparison_id
      returning (xmax = 0) into v_inserted;
      if v_inserted then v_new := v_new + 1; end if;
    end loop;
  end if;
  update public.drawing_comparisons set finding_count = v_total, new_count = v_new where id = v_id;
  return query select v_id, v_total, v_new;
end $$;
revoke execute on function public.save_drawing_comparison(uuid,uuid,uuid,uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.save_drawing_comparison(uuid,uuid,uuid,uuid,text,text,text,jsonb) to service_role;

-- Reviewer decision. Accepting or amending creates (or appends to) one draft change per drawing revision pair.
create or replace function public.review_comparison_finding(_finding uuid, _decision text, _amended text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare f public.comparison_findings; v_change uuid; d public.project_records; a text; b text;
begin
  select * into f from public.comparison_findings where id = _finding;
  if f.id is null then raise exception 'NOT_FOUND'; end if;
  if not public.can_manage_project(f.tenant_id, f.project_id) then raise exception 'NOT_ALLOWED'; end if;
  if not public.project_module_active(f.tenant_id, f.project_id, 'drawings') then raise exception 'MODULE_NOT_ACTIVE'; end if;
  if _decision not in ('accepted','amended','rejected') then raise exception 'BAD_DECISION'; end if;
  if _decision = 'amended' and length(trim(coalesce(_amended, ''))) < 5 then raise exception 'AMENDMENT_REQUIRED'; end if;
  if f.change_record_id is not null and exists (select 1 from public.project_records c where c.id = f.change_record_id and c.status <> 'draft') then
    raise exception 'CHANGE_NOT_DRAFT';
  end if;
  if _decision = 'rejected' then
    update public.comparison_findings set decision = 'rejected', amended_summary = null, reviewed_by = auth.uid(), reviewed_at = now(), change_record_id = null where id = f.id;
    return null;
  end if;
  if not public.project_module_active(f.tenant_id, f.project_id, 'change_control') then raise exception 'CHANGE_MODULE_OFF'; end if;
  v_change := f.change_record_id;
  if v_change is null then
    select cf.change_record_id into v_change from public.comparison_findings cf join public.project_records c on c.id = cf.change_record_id
      where cf.from_revision_id = f.from_revision_id and cf.to_revision_id = f.to_revision_id and c.status = 'draft' limit 1;
  end if;
  if v_change is null then
    select * into d from public.project_records where id = f.record_id;
    select revision into a from public.drawing_revisions where id = f.from_revision_id;
    select revision into b from public.drawing_revisions where id = f.to_revision_id;
    insert into public.project_records (tenant_id, project_id, module_id, title, description, status, fields)
    values (f.tenant_id, f.project_id, 'change_control', left('Drawing ' || coalesce(d.fields->>'number', d.reference) || ' changes ' || a || ' to ' || b, 200),
      'Draft created from reviewed drawing comparison findings. Not approved; no entitlement or value is implied.', 'draft',
      jsonb_build_object('source', 'drawing_comparison', 'drawing_record_id', f.record_id, 'from_revision_id', f.from_revision_id, 'to_revision_id', f.to_revision_id))
    returning id into v_change;
    insert into public.record_links (tenant_id, from_record_id, to_record_id) values (f.tenant_id, v_change, f.record_id) on conflict do nothing;
  end if;
  update public.comparison_findings set decision = _decision, amended_summary = case when _decision = 'amended' then trim(_amended) end,
    reviewed_by = auth.uid(), reviewed_at = now(), change_record_id = v_change where id = f.id;
  return v_change;
end $$;
revoke execute on function public.review_comparison_finding(uuid,text,text) from public, anon;
grant execute on function public.review_comparison_finding(uuid,text,text) to authenticated;