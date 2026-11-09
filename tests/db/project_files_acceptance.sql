-- Project photos and documents checks (stage P2). Run through the backend SQL tool; everything rolls back.
-- Expected: bad_path=refused, dan_upload_off=false, dan_upload_on=true, dan_v1=1, dan_v2=2, direct_version=refused,
--   historic_versions=2, missing_upload=refused, new_after_off=refused, rm_read_object=false, rm_sees_files=0, rm_upload=false
begin;
create temp table r(k text, v text) on commit drop;
create temp table ids(k text, v uuid) on commit drop;
grant all on r, ids to authenticated;
insert into ids select 'p', id from public.projects where tenant_id = '9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7' order by reference limit 1;
insert into ids values ('f', gen_random_uuid());
create temp view pth as select '9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7/' || (select v from ids where k='p') || '/photos/' || (select v from ids where k='f') as base;
grant select on pth to authenticated;
update public.tenant_modules set enabled = false where tenant_id = '9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7' and module_id = 'photos';

select set_config('request.jwt.claims', '{"sub":"7f62dbef-3d8c-428c-8f90-904bd01ea448","role":"authenticated"}', true);
set local role authenticated;
insert into r select 'dan_upload_off', public.can_write_project_file_object((select base from pth) || '/a-x.jpg')::text;
reset role;
update public.tenant_modules set enabled = true where tenant_id = '9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7' and module_id in ('clients_projects','photos');
insert into public.project_modules (tenant_id, project_id, module_id, enabled) values ('9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7', (select v from ids where k='p'), 'photos', true)
  on conflict (project_id, module_id) do update set enabled = true;
set local role authenticated;
insert into r select 'dan_upload_on', public.can_write_project_file_object((select base from pth) || '/a-x.jpg')::text;
do $$ begin perform public.record_project_file_version((select v from ids where k='f'), (select v from ids where k='p'), 'photos', (select base from pth) || '/a-x.jpg', 'x.jpg', 'image/jpeg', 10);
  insert into r values ('missing_upload','ALLOWED'); exception when others then insert into r values ('missing_upload','refused'); end $$;
insert into storage.objects (bucket_id, name) select 'project-files', base || '/a-x.jpg' from pth;
insert into storage.objects (bucket_id, name) select 'project-files', base || '/b-x.jpg' from pth;
insert into r select 'dan_v1', public.record_project_file_version((select v from ids where k='f'), (select v from ids where k='p'), 'photos', (select base from pth) || '/a-x.jpg', 'x.jpg', 'image/jpeg', 10, '', 'Roof', 'cap', '{Roof}')::text;
insert into r select 'dan_v2', public.record_project_file_version((select v from ids where k='f'), (select v from ids where k='p'), 'photos', (select base from pth) || '/b-x.jpg', 'x.jpg', 'image/jpeg', 12)::text;
do $$ begin perform public.record_project_file_version((select v from ids where k='f'), (select v from ids where k='p'), 'documents', (select base from pth) || '/b-x.jpg', 'x.jpg', 'image/jpeg', 12);
  insert into r values ('bad_path','ALLOWED'); exception when others then insert into r values ('bad_path','refused'); end $$;
do $$ begin update public.project_files set current_version = 9 where id = (select v from ids where k='f');
  insert into r values ('direct_version','ALLOWED'); exception when others then insert into r values ('direct_version','refused'); end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"a6a521aa-4a96-447a-9eaf-37a96823915f","role":"authenticated"}', true);
set local role authenticated;
insert into r select 'rm_sees_files', count(*)::text from public.project_files where tenant_id = '9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7';
insert into r select 'rm_read_object', public.can_read_project_file_object((select base from pth) || '/a-x.jpg')::text;
insert into r select 'rm_upload', public.can_write_project_file_object((select base from pth) || '/c-x.jpg')::text;
reset role;

update public.tenant_modules set enabled = false where tenant_id = '9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7' and module_id = 'photos';
select set_config('request.jwt.claims', '{"sub":"7f62dbef-3d8c-428c-8f90-904bd01ea448","role":"authenticated"}', true);
set local role authenticated;
insert into r select 'historic_versions', count(*)::text from public.project_file_versions where file_id = (select v from ids where k='f');
insert into r select 'new_after_off', case when public.can_write_project_file_object((select base from pth) || '/d-x.jpg') then 'ALLOWED' else 'refused' end;
reset role;
select string_agg(k||'='||v, ', ' order by k) from r;
rollback;
