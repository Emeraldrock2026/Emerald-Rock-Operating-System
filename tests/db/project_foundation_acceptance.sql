-- Project groundwork access checks (stage P1). Run through the backend SQL tool; everything rolls back.
-- Expected: apply_skipped={drawings}, cross_tenant_team=refused, dan_add_drawings_project_module=refused,
--   dan_folders=3, dan_record_drawings=refused, dan_record_ref=<ERC project ref>-PHO-0001, dan_sees_historic_after_off=1,
--   dan_new_record_after_off=refused, rm_sees_erc_records=0, rm_sees_erc_templates=0, rm_team_insert=refused, rm_activity_rows=0
-- Ids: Emerald Rock 9dc6a64c-…, Harbour 8a22502a-…, Dan (Owner/Admin both) 7f62dbef-…, info@ (RM on Harbour only) a6a521aa-…
begin;
create temp table r(k text, v text) on commit drop;
create temp table ids(k text, v uuid) on commit drop;
grant all on r, ids to authenticated;
update public.tenant_modules set enabled = true where tenant_id = '9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7' and module_id in ('clients_projects','photos');
insert into ids select 'p', id from public.projects where tenant_id = '9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7' order by reference limit 1;
insert into ids select 'harbour_emp', id from public.employees where tenant_id = '8a22502a-072a-4d17-92b2-03f6482ff26a' limit 1;

select set_config('request.jwt.claims', '{"sub":"7f62dbef-3d8c-428c-8f90-904bd01ea448","role":"authenticated"}', true);
set local role authenticated;
insert into public.project_templates (tenant_id, name, module_ids, folder_paths)
  values ('9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7', 'P1 test template', '{photos,drawings}', '{Drawings/Architectural,Photos}');
insert into r select 'apply_skipped', public.apply_project_template((select v from ids where k='p'), (select id from public.project_templates where name='P1 test template'))::text;
insert into r select 'dan_folders', count(*)::text from public.project_folders where project_id = (select v from ids where k='p');
insert into public.project_records (tenant_id, project_id, module_id, title) values ('9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7', (select v from ids where k='p'), 'photos', 'Test');
insert into r select 'dan_record_ref', reference from public.project_records where project_id = (select v from ids where k='p') and title='Test';
do $$ begin insert into public.project_records (tenant_id, project_id, module_id, title) values ('9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7', (select v from ids where k='p'), 'drawings', 'X'); insert into r values ('dan_record_drawings','ALLOWED'); exception when others then insert into r values ('dan_record_drawings','refused'); end $$;
do $$ begin insert into public.project_modules (tenant_id, project_id, module_id) values ('9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7', (select v from ids where k='p'), 'drawings'); insert into r values ('dan_add_drawings_project_module','ALLOWED'); exception when others then insert into r values ('dan_add_drawings_project_module','refused'); end $$;
do $$ begin insert into public.project_team (tenant_id, project_id, employee_id) values ('9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7', (select v from ids where k='p'), (select v from ids where k='harbour_emp')); insert into r values ('cross_tenant_team','ALLOWED'); exception when others then insert into r values ('cross_tenant_team','refused'); end $$;
reset role;

update public.tenant_modules set enabled = false where tenant_id = '9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7' and module_id = 'photos';
set local role authenticated;
insert into r select 'dan_sees_historic_after_off', count(*)::text from public.project_records where project_id = (select v from ids where k='p');
do $$ begin insert into public.project_records (tenant_id, project_id, module_id, title) values ('9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7', (select v from ids where k='p'), 'photos', 'Y'); insert into r values ('dan_new_record_after_off','ALLOWED'); exception when others then insert into r values ('dan_new_record_after_off','refused'); end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"a6a521aa-4a96-447a-9eaf-37a96823915f","role":"authenticated"}', true);
set local role authenticated;
insert into r select 'rm_sees_erc_records', count(*)::text from public.project_records where tenant_id = '9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7';
insert into r select 'rm_sees_erc_templates', count(*)::text from public.project_templates where tenant_id = '9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7';
insert into r select 'rm_activity_rows', count(*)::text from public.project_activity((select v from ids where k='p'), 50);
do $$ begin insert into public.project_team (tenant_id, project_id, employee_id) select '9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7', (select v from ids where k='p'), id from public.employees limit 1; if not found then raise exception 'none'; end if; insert into r values ('rm_team_insert','ALLOWED'); exception when others then insert into r values ('rm_team_insert','refused'); end $$;
reset role;
select string_agg(k||'='||v, ', ' order by k) from r;
rollback;
