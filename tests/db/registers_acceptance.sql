-- RFIs, early warnings and programmes checks (stage P6). Run through the backend SQL tool; everything rolls back.
-- Uses the Harbour Planning test project HPD-0001 with RFIs, Early warnings and Programmes on. Dan is its project admin.
-- Expected: admin_close=closed, closed_flag=true, ew_first=open, ew_member_close=refused ADMIN_ONLY_STATUS, member_reopen=refused ADMIN_ONLY_STATUS,
--   member_rfi=ok, member_respond_blank=refused RESPONSE_REQUIRED, member_responded=responded, other_business_sees=0, prog_current=current,
--   prog_member_current=refused ADMIN_ONLY_STATUS, prog_no_file=refused PROGRAMME_FILE_REQUIRED, prog_old=superseded, rfi_off_member=0,
--   rfi_off_admin=1, rfi_off_edit=refused, prog_ref=<project>-PRG-000n, viewer_rfi=refused, viewer_comment=refused, member_comment=ok, bad_status=refused BAD_STATUS
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
insert into employees (tenant_id, full_name, user_id) values
  ((select v from ids where k='t'), 'Mem', (select v from ids where k='mem')), ((select v from ids where k='t'), 'View', (select v from ids where k='vw'));
insert into project_team (tenant_id, project_id, employee_id, project_role)
  select e.tenant_id, (select v from ids where k='p'), e.id, case when e.user_id = (select v from ids where k='mem') then 'member' else 'viewer' end
  from employees e where e.user_id in ((select v from ids where k='mem'), (select v from ids where k='vw'));
insert into project_files (id, tenant_id, project_id, module_id, title, current_version) values ((select v from ids where k='f'), (select v from ids where k='t'), (select v from ids where k='p'), 'programmes', 'prog.pdf', 1);

-- Member raises an RFI, can respond but not close
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='mem'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into project_records (tenant_id, project_id, module_id, title, status) values ((select v from ids where k='t'), (select v from ids where k='p'), 'rfis', 'RFI test', 'open');
insert into r values ('member_rfi','ok');
insert into ids select 'rfi', id from project_records where title = 'RFI test';
do $$ begin update project_records set status = 'responded' where id = (select v from ids where k='rfi');
  insert into r values ('member_respond_blank','ALLOWED'); exception when others then insert into r values ('member_respond_blank','refused ' || sqlerrm); end $$;
do $$ begin update project_records set status = 'waiting' where id = (select v from ids where k='rfi');
  insert into r values ('bad_status','ALLOWED'); exception when others then insert into r values ('bad_status','refused ' || sqlerrm); end $$;
update project_records set status = 'responded', fields = '{"response":"Use detail 4"}' where id = (select v from ids where k='rfi');
insert into r select 'member_responded', status from project_records where id = (select v from ids where k='rfi');
insert into record_comments (tenant_id, record_id, body, author_id) values ((select v from ids where k='t'), (select v from ids where k='rfi'), 'Noted', auth.uid());
insert into r values ('member_comment','ok');
insert into project_records (tenant_id, project_id, module_id, title, status) values ((select v from ids where k='t'), (select v from ids where k='p'), 'early_warnings', 'EW test', 'draft');
insert into r select 'ew_first', status from project_records where title = 'EW test';
do $$ begin update project_records set status = 'closed' where title = 'EW test';
  insert into r values ('ew_member_close','ALLOWED'); exception when others then insert into r values ('ew_member_close','refused ' || sqlerrm); end $$;
insert into project_records (tenant_id, project_id, module_id, title, status, fields) values ((select v from ids where k='t'), (select v from ids where k='p'), 'programmes', 'Prog A', 'submitted', json_build_object('file_id', (select v from ids where k='f'))::jsonb);
do $$ begin update project_records set status = 'current' where title = 'Prog A';
  insert into r values ('prog_member_current','ALLOWED'); exception when others then insert into r values ('prog_member_current','refused ' || sqlerrm); end $$;
reset role;

-- Viewer can't raise or comment
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='vw'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin insert into project_records (tenant_id, project_id, module_id, title) values ((select v from ids where k='t'), (select v from ids where k='p'), 'rfis', 'V');
  insert into r values ('viewer_rfi','ALLOWED'); exception when others then insert into r values ('viewer_rfi','refused'); end $$;
do $$ begin insert into record_comments (tenant_id, record_id, body, author_id) values ((select v from ids where k='t'), (select v from ids where k='rfi'), 'x', auth.uid());
  insert into r values ('viewer_comment','ALLOWED'); exception when others then insert into r values ('viewer_comment','refused'); end $$;
reset role;

-- Project admin closes, makes programmes current (previous one superseded)
select set_config('request.jwt.claims', '{"sub":"7f62dbef-3d8c-428c-8f90-904bd01ea448","role":"authenticated"}', true);
set local role authenticated;
update project_records set status = 'closed' where id = (select v from ids where k='rfi');
insert into r select 'admin_close', status from project_records where id = (select v from ids where k='rfi');
insert into r select 'closed_flag', is_closed::text from project_records where id = (select v from ids where k='rfi');
do $$ begin insert into project_records (tenant_id, project_id, module_id, title, status) values ((select v from ids where k='t'), (select v from ids where k='p'), 'programmes', 'Prog none', 'current');
  insert into r values ('prog_no_file','ALLOWED'); exception when others then insert into r values ('prog_no_file','refused ' || sqlerrm); end $$;
update project_records set status = 'current' where title = 'Prog A';
insert into project_records (tenant_id, project_id, module_id, title, status, fields) values ((select v from ids where k='t'), (select v from ids where k='p'), 'programmes', 'Prog B', 'current', json_build_object('file_id', (select v from ids where k='f'))::jsonb);
insert into r select 'prog_old', status from project_records where title = 'Prog A';
insert into r select 'prog_current', status from project_records where title = 'Prog B';
insert into r select 'prog_ref', reference from project_records where title = 'Prog B';
reset role;

-- Member can't reopen a closed RFI
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='mem'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin update project_records set status = 'open' where id = (select v from ids where k='rfi');
  insert into r values ('member_reopen','ALLOWED'); exception when others then insert into r values ('member_reopen','refused ' || sqlerrm); end $$;
reset role;

-- Another business sees nothing
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='out'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r select 'other_business_sees', count(*)::text from project_records where project_id = (select v from ids where k='p');
reset role;

-- RFIs switched off for the project
delete from project_modules where project_id = (select v from ids where k='p') and module_id = 'rfis';
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='mem'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r select 'rfi_off_member', count(*)::text from project_records where id = (select v from ids where k='rfi');
reset role;
select set_config('request.jwt.claims', '{"sub":"7f62dbef-3d8c-428c-8f90-904bd01ea448","role":"authenticated"}', true);
set local role authenticated;
insert into r select 'rfi_off_admin', count(*)::text from project_records where id = (select v from ids where k='rfi');
do $$ declare n int; begin update project_records set title = 'changed' where id = (select v from ids where k='rfi'); get diagnostics n = row_count;
  insert into r values ('rfi_off_edit', case when n = 0 then 'refused' else 'ALLOWED' end); exception when others then insert into r values ('rfi_off_edit','refused'); end $$;
reset role;
select string_agg(k||'='||v, ' ; ' order by k) res from r;
rollback;
