-- Dashboard charts data checks (dashboard stage 2). Run through the backend SQL tool; everything rolls back.
-- Uses the Harbour Planning test project HPD-0001. The dashboard reads project_records, project_files (photos) and report_issues with the user's own access.
-- Expected: member_records=all, viewer_records=all, member_photos=all, viewer_photos=all, member_issues=all, viewer_issues=all,
--   outsider_records=0, outsider_photos=0, outsider_issues=0, qa_off_member=0, qa_off_viewer=0, nonteam_employee_records=0
begin;
create temp table r(k text, v text) on commit drop;
create temp table ids(k text, v uuid) on commit drop;
create temp table base(k text, n int) on commit drop;
grant all on r, ids, base to authenticated;
insert into ids values ('t','8a22502a-072a-4d17-92b2-03f6482ff26a'), ('p','e977adf3-28db-49d1-87e2-caeb01bc14ad'),
  ('mem','10000000-0000-0000-0000-0000000000d1'), ('vw','10000000-0000-0000-0000-0000000000d2'),
  ('out','10000000-0000-0000-0000-0000000000d3'), ('emp','10000000-0000-0000-0000-0000000000d4');
insert into base select 'records', count(*) from project_records where project_id = (select v from ids where k='p');
insert into base select 'photos', count(*) from project_files where project_id = (select v from ids where k='p') and module_id = 'photos';
insert into base select 'issues', count(*) from report_issues where project_id = (select v from ids where k='p');
insert into tenant_memberships (tenant_id, user_id, email, role, status) values
  ((select v from ids where k='t'), (select v from ids where k='mem'), 'dmem@test.invalid', 'employee', 'active'),
  ((select v from ids where k='t'), (select v from ids where k='vw'), 'dvw@test.invalid', 'employee', 'active'),
  ((select v from ids where k='t'), (select v from ids where k='emp'), 'demp@test.invalid', 'employee', 'active'),
  ('9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7', (select v from ids where k='out'), 'dout@test.invalid', 'owner_admin', 'active');
insert into employees (tenant_id, full_name, user_id) values
  ((select v from ids where k='t'), 'DMem', (select v from ids where k='mem')), ((select v from ids where k='t'), 'DView', (select v from ids where k='vw')),
  ((select v from ids where k='t'), 'DEmp', (select v from ids where k='emp'));
insert into project_team (tenant_id, project_id, employee_id, project_role)
  select e.tenant_id, (select v from ids where k='p'), e.id, case when e.user_id = (select v from ids where k='mem') then 'member' else 'viewer' end
  from employees e where e.user_id in ((select v from ids where k='mem'), (select v from ids where k='vw'));

create or replace function pg_temp.see(who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k=who), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into r select who || '_records', case when count(*) = (select n from base where k='records') then 'all' else count(*)::text end from project_records where project_id = (select v from ids where k='p');
  insert into r select who || '_photos', case when count(*) = (select n from base where k='photos') then 'all' else count(*)::text end from project_files where project_id = (select v from ids where k='p') and module_id='photos';
  insert into r select who || '_issues', case when count(*) = (select n from base where k='issues') then 'all' else count(*)::text end from report_issues where project_id = (select v from ids where k='p');
  execute 'reset role';
end $$;
select pg_temp.see('mem'); select pg_temp.see('vw'); select pg_temp.see('out');
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='emp'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r select 'nonteam_employee_records', count(*)::text from project_records where project_id = (select v from ids where k='p');
reset role;

-- QA switched off for the project: team members and viewers no longer read QA records, so the QA chart has nothing to show.
delete from project_modules where project_id = (select v from ids where k='p') and module_id = 'qa';
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='mem'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r select 'qa_off_member', count(*)::text from project_records where project_id = (select v from ids where k='p') and module_id='qa';
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='vw'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r select 'qa_off_viewer', count(*)::text from project_records where project_id = (select v from ids where k='p') and module_id='qa';
reset role;
select set_config('request.jwt.claims', '', true);
select string_agg(k||'='||v, ' ; ' order by k) || ' | baseline ' || (select string_agg(k||'='||n, ' ') from base) res from r;
rollback;
