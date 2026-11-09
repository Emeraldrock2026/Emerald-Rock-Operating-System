-- Progress/delay report issue checks (stage P5). Run through the backend SQL tool; everything rolls back.
-- Uses the Harbour Planning test project HPD-0001 (Progress and Delay reports on). Dan is its project admin.
-- Expected: admin_after_off=1, direct_insert=refused, direct_update=refused, duplicate=refused DUPLICATE_ISSUE, issue1=1, issue2=2,
--   member_issue=refused NOT_ALLOWED, member_after_off=0, member_record=ok, off_issue=refused MODULE_NOT_ACTIVE, other_business_sees=0,
--   stale=refused STALE_EDIT, status=issued, viewer_record=refused, wrong_file=refused BAD_FILE_PATH
begin;
create temp table r(k text, v text) on commit drop;
create temp table ids(k text, v uuid) on commit drop;
grant all on r, ids to authenticated;
insert into ids values ('t','8a22502a-072a-4d17-92b2-03f6482ff26a'), ('p','e977adf3-28db-49d1-87e2-caeb01bc14ad'),
  ('f', gen_random_uuid()), ('mem','10000000-0000-0000-0000-0000000000e1'), ('vw','10000000-0000-0000-0000-0000000000e2'), ('out','10000000-0000-0000-0000-0000000000e3');
insert into tenant_memberships (tenant_id, user_id, email, role, status) values
  ((select v from ids where k='t'), (select v from ids where k='mem'), 'mem@test.invalid', 'employee', 'active'),
  ((select v from ids where k='t'), (select v from ids where k='vw'), 'vw@test.invalid', 'employee', 'active'),
  ('9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7', (select v from ids where k='out'), 'out@test.invalid', 'owner_admin', 'active');
insert into employees (id, tenant_id, full_name, user_id) values
  (gen_random_uuid(), (select v from ids where k='t'), 'Mem', (select v from ids where k='mem')),
  (gen_random_uuid(), (select v from ids where k='t'), 'View', (select v from ids where k='vw'));
insert into project_team (tenant_id, project_id, employee_id, project_role)
  select e.tenant_id, (select v from ids where k='p'), e.id, case when e.user_id = (select v from ids where k='mem') then 'member' else 'viewer' end
  from employees e where e.user_id in ((select v from ids where k='mem'), (select v from ids where k='vw'));
-- A stored PDF for the issue (as the service)
insert into project_files (id, tenant_id, project_id, module_id, title, current_version) values ((select v from ids where k='f'), (select v from ids where k='t'), (select v from ids where k='p'), 'progress_reports', 'x.pdf', 2);
insert into project_file_versions (tenant_id, file_id, version_no, storage_path, file_name, mime_type, size_bytes)
  select (select v from ids where k='t'), (select v from ids where k='f'), n, 'test/' || n || gen_random_uuid(), 'x.pdf', 'application/pdf', 10 from generate_series(1,2) n;

-- Member drafts; viewer can't
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='mem'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into project_records (tenant_id, project_id, module_id, title) values ((select v from ids where k='t'), (select v from ids where k='p'), 'progress_reports', 'Week 45 test');
insert into r values ('member_record','ok');
insert into ids select 'rec', id from project_records where title = 'Week 45 test';
do $$ begin perform public.issue_project_report((select v from ids where k='rec'), 1, (select v from ids where k='f'), 1, repeat('a',64), '{}');
  insert into r values ('member_issue','ALLOWED'); exception when others then insert into r values ('member_issue','refused ' || sqlerrm); end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='vw'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin insert into project_records (tenant_id, project_id, module_id, title) values ((select v from ids where k='t'), (select v from ids where k='p'), 'progress_reports', 'V');
  insert into r values ('viewer_record','ALLOWED'); exception when others then insert into r values ('viewer_record','refused'); end $$;
reset role;

-- Project admin issues
select set_config('request.jwt.claims', '{"sub":"7f62dbef-3d8c-428c-8f90-904bd01ea448","role":"authenticated"}', true);
set local role authenticated;
do $$ begin perform public.issue_project_report((select v from ids where k='rec'), 1, gen_random_uuid(), 1, repeat('a',64), '{}');
  insert into r values ('wrong_file','ALLOWED'); exception when others then insert into r values ('wrong_file','refused ' || sqlerrm); end $$;
insert into r select 'issue1', public.issue_project_report((select v from ids where k='rec'), (select version from project_records where id=(select v from ids where k='rec')), (select v from ids where k='f'), 1, repeat('a',64), '{"x":1}')::text;
insert into r select 'status', status from project_records where id = (select v from ids where k='rec');
do $$ begin perform public.issue_project_report((select v from ids where k='rec'), (select version from project_records where id=(select v from ids where k='rec')), (select v from ids where k='f'), 2, repeat('a',64), '{}');
  insert into r values ('duplicate','ALLOWED'); exception when others then insert into r values ('duplicate','refused ' || sqlerrm); end $$;
do $$ begin perform public.issue_project_report((select v from ids where k='rec'), 1, (select v from ids where k='f'), 2, repeat('b',64), '{}');
  insert into r values ('stale','ALLOWED'); exception when others then insert into r values ('stale','refused ' || sqlerrm); end $$;
insert into r select 'issue2', public.issue_project_report((select v from ids where k='rec'), (select version from project_records where id=(select v from ids where k='rec')), (select v from ids where k='f'), 2, repeat('b',64), '{}')::text;
do $$ begin insert into report_issues (tenant_id, project_id, record_id, module_id, issue_no, content_hash, snapshot, file_id, file_version, issued_by)
  values ((select v from ids where k='t'), (select v from ids where k='p'), (select v from ids where k='rec'), 'progress_reports', 9, repeat('c',64), '{}', (select v from ids where k='f'), 1, auth.uid());
  insert into r values ('direct_insert','ALLOWED'); exception when others then insert into r values ('direct_insert','refused'); end $$;
do $$ declare n int; begin update report_issues set note = 'changed' where record_id = (select v from ids where k='rec'); get diagnostics n = row_count;
  insert into r values ('direct_update', case when n = 0 then 'refused' else 'ALLOWED' end); exception when others then insert into r values ('direct_update','refused'); end $$;
reset role;

-- Another business sees nothing
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='out'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r select 'other_business_sees', count(*)::text from report_issues where record_id = (select v from ids where k='rec');
reset role;

-- Module switched off for the project: history stays for the project admin, hidden from members, no new issues
delete from project_modules where project_id = (select v from ids where k='p') and module_id = 'progress_reports';
select set_config('request.jwt.claims', '{"sub":"7f62dbef-3d8c-428c-8f90-904bd01ea448","role":"authenticated"}', true);
set local role authenticated;
insert into r select 'admin_after_off', count(*)::text from report_issues where record_id = (select v from ids where k='rec') and issue_no = 1;
do $$ begin perform public.issue_project_report((select v from ids where k='rec'), (select version from project_records where id=(select v from ids where k='rec')), (select v from ids where k='f'), 1, repeat('d',64), '{}');
  insert into r values ('off_issue','ALLOWED'); exception when others then insert into r values ('off_issue','refused ' || sqlerrm); end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='mem'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r select 'member_after_off', count(*)::text from report_issues;
reset role;
select string_agg(k||'='||v, ' ; ' order by k) from r;
rollback;
