-- QA, handover, RAMS, deliveries, procurement, assets and plant checks (stage P7). Run through the backend SQL tool; everything rolls back.
-- Uses the Harbour Planning test project HPD-0001 with these modules on. Dan is its project admin.
-- Expected: qa_ref=<project>-QA-000n, qa_no_result=refused RESULT_REQUIRED, qa_passed=passed, qa_member_close=refused ADMIN_ONLY_STATUS,
--   rams_upload_status=draft, rams_submit_no_file=refused FILE_REQUIRED, rams_member_approve=refused ADMIN_ONLY_STATUS, rams_admin_approve=approved,
--   rams_swap_file=refused FILE_LOCKED, rams_wrong_file=refused BAD_FILE_PATH, handover_member_accept=refused ADMIN_ONLY_STATUS,
--   proc_no_supplier=refused SUPPLIER_REQUIRED, proc_member_award=refused ADMIN_ONLY_STATUS, delivery_member_delivered=delivered,
--   delivery_member_cancel=refused ADMIN_ONLY_STATUS, asset_member_offhire=off_hired, asset_closed_on=set, viewer_qa=refused,
--   other_business_sees=0, qa_off_member=0, qa_off_admin=1, qa_off_edit=refused
begin;
create temp table r(k text, v text) on commit drop;
create temp table ids(k text, v uuid) on commit drop;
grant all on r, ids to authenticated;
insert into ids values ('t','8a22502a-072a-4d17-92b2-03f6482ff26a'), ('p','e977adf3-28db-49d1-87e2-caeb01bc14ad'), ('dan','7f62dbef-3d8c-428c-8f90-904bd01ea448'),
  ('f', gen_random_uuid()), ('f2', gen_random_uuid()), ('fp', gen_random_uuid()), ('fh', gen_random_uuid()),
  ('mem','10000000-0000-0000-0000-0000000000e1'), ('vw','10000000-0000-0000-0000-0000000000e2'), ('out','10000000-0000-0000-0000-0000000000e3');
insert into tenant_memberships (tenant_id, user_id, email, role, status) values
  ((select v from ids where k='t'), (select v from ids where k='mem'), 'mem@test.invalid', 'employee', 'active'),
  ((select v from ids where k='t'), (select v from ids where k='vw'), 'vw@test.invalid', 'employee', 'active'),
  ('9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7', (select v from ids where k='out'), 'out@test.invalid', 'owner_admin', 'active');
insert into employees (tenant_id, full_name, user_id) values
  ((select v from ids where k='t'), 'Mem', (select v from ids where k='mem')), ((select v from ids where k='t'), 'View', (select v from ids where k='vw'));
insert into project_team (tenant_id, project_id, employee_id, project_role)
  select e.tenant_id, (select v from ids where k='p'), e.id, case when e.user_id = (select v from ids where k='mem') then 'member' else 'viewer' end
  from employees e where e.user_id in ((select v from ids where k='mem'), (select v from ids where k='vw'));
insert into project_files (id, tenant_id, project_id, module_id, title, current_version) values
  ((select v from ids where k='f'), (select v from ids where k='t'), (select v from ids where k='p'), 'rams', 'rams.pdf', 1),
  ((select v from ids where k='f2'), (select v from ids where k='t'), (select v from ids where k='p'), 'rams', 'rams2.pdf', 1),
  ((select v from ids where k='fp'), (select v from ids where k='t'), (select v from ids where k='p'), 'programmes', 'prog.pdf', 1),
  ((select v from ids where k='fh'), (select v from ids where k='t'), (select v from ids where k='p'), 'handover', 'om.pdf', 1);

-- Member
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='mem'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into project_records (tenant_id, project_id, module_id, title, status) values ((select v from ids where k='t'), (select v from ids where k='p'), 'qa', 'QA test', 'open');
insert into r select 'qa_ref', reference from project_records where title = 'QA test';
do $$ begin update project_records set status = 'passed' where title = 'QA test';
  insert into r values ('qa_no_result','ALLOWED'); exception when others then insert into r values ('qa_no_result','refused ' || sqlerrm); end $$;
update project_records set status = 'passed', fields = '{"result":"Fixings as specified"}' where title = 'QA test';
insert into r select 'qa_passed', status from project_records where title = 'QA test';
do $$ begin update project_records set status = 'closed' where title = 'QA test';
  insert into r values ('qa_member_close','ALLOWED'); exception when others then insert into r values ('qa_member_close','refused ' || sqlerrm); end $$;

insert into project_records (tenant_id, project_id, module_id, title, status) values ((select v from ids where k='t'), (select v from ids where k='p'), 'rams', 'RAMS test', 'draft');
do $$ begin update project_records set status = 'submitted' where title = 'RAMS test';
  insert into r values ('rams_submit_no_file','ALLOWED'); exception when others then insert into r values ('rams_submit_no_file','refused ' || sqlerrm); end $$;
update project_records set fields = json_build_object('file_id', (select v from ids where k='f'), 'file_version', 1)::jsonb where title = 'RAMS test';
insert into r select 'rams_upload_status', status from project_records where title = 'RAMS test';
do $$ begin update project_records set fields = json_build_object('file_id', (select v from ids where k='fp'))::jsonb where title = 'RAMS test';
  insert into r values ('rams_wrong_file','ALLOWED'); exception when others then insert into r values ('rams_wrong_file','refused ' || sqlerrm); end $$;
update project_records set status = 'submitted' where title = 'RAMS test';
do $$ begin update project_records set status = 'approved' where title = 'RAMS test';
  insert into r values ('rams_member_approve','ALLOWED'); exception when others then insert into r values ('rams_member_approve','refused ' || sqlerrm); end $$;

insert into project_records (tenant_id, project_id, module_id, title, status) values ((select v from ids where k='t'), (select v from ids where k='p'), 'handover', 'HO test', 'not_started');
do $$ begin update project_records set status = 'accepted', fields = json_build_object('file_id', (select v from ids where k='fh'))::jsonb where title = 'HO test';
  insert into r values ('handover_member_accept','ALLOWED'); exception when others then insert into r values ('handover_member_accept','refused ' || sqlerrm); end $$;

insert into project_records (tenant_id, project_id, module_id, title, status) values ((select v from ids where k='t'), (select v from ids where k='p'), 'procurement', 'PCM test', 'tendering');
do $$ begin update project_records set status = 'ordered' where title = 'PCM test';
  insert into r values ('proc_no_supplier','ALLOWED'); exception when others then insert into r values ('proc_no_supplier','refused ' || sqlerrm); end $$;
do $$ begin update project_records set status = 'awarded', fields = '{"supplier":"Acme"}' where title = 'PCM test';
  insert into r values ('proc_member_award','ALLOWED'); exception when others then insert into r values ('proc_member_award','refused ' || sqlerrm); end $$;

insert into project_records (tenant_id, project_id, module_id, title, status, due_date) values ((select v from ids where k='t'), (select v from ids where k='p'), 'deliveries', 'DLV test', 'expected', '2026-11-20'),
  ((select v from ids where k='t'), (select v from ids where k='p'), 'deliveries', 'DLV test 2', 'expected', '2026-11-20');
update project_records set status = 'delivered' where title = 'DLV test';
insert into r select 'delivery_member_delivered', status from project_records where title = 'DLV test';
do $$ begin update project_records set status = 'cancelled' where title = 'DLV test 2';
  insert into r values ('delivery_member_cancel','ALLOWED'); exception when others then insert into r values ('delivery_member_cancel','refused ' || sqlerrm); end $$;

insert into project_records (tenant_id, project_id, module_id, title, status) values ((select v from ids where k='t'), (select v from ids where k='p'), 'assets_plant', 'AST test', 'on_site');
update project_records set status = 'off_hired' where title = 'AST test';
insert into r select 'asset_member_offhire', status from project_records where title = 'AST test';
insert into r select 'asset_closed_on', case when completed_on is not null then 'set' else 'missing' end from project_records where title = 'AST test';
reset role;

-- Viewer
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='vw'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin insert into project_records (tenant_id, project_id, module_id, title, status) values ((select v from ids where k='t'), (select v from ids where k='p'), 'qa', 'V', 'open');
  insert into r values ('viewer_qa','ALLOWED'); exception when others then insert into r values ('viewer_qa','refused'); end $$;
reset role;

-- Project admin approves RAMS; the approved file can't then be swapped
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='dan'), 'role', 'authenticated')::text, true);
set local role authenticated;
update project_records set status = 'approved' where title = 'RAMS test';
insert into r select 'rams_admin_approve', status from project_records where title = 'RAMS test';
do $$ begin update project_records set fields = json_build_object('file_id', (select v from ids where k='f2'), 'file_version', 1)::jsonb where title = 'RAMS test';
  insert into r values ('rams_swap_file','ALLOWED'); exception when others then insert into r values ('rams_swap_file','refused ' || sqlerrm); end $$;
reset role;

-- Another business sees nothing
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='out'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r select 'other_business_sees', count(*)::text from project_records where project_id = (select v from ids where k='p') and module_id in ('qa','rams','handover','procurement','deliveries','assets_plant');
reset role;

-- QA switched off for the project: member sees nothing, admin reads history, nobody edits
update project_modules set enabled = false where project_id = (select v from ids where k='p') and module_id = 'qa';
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='mem'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r select 'qa_off_member', count(*)::text from project_records where title = 'QA test';
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k='dan'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r select 'qa_off_admin', count(*)::text from project_records where title = 'QA test';
do $$ declare n int; begin update project_records set title = 'QA x' where title = 'QA test'; get diagnostics n = row_count;
  insert into r values ('qa_off_edit', case when n = 0 then 'refused' else 'ALLOWED' end); exception when others then insert into r values ('qa_off_edit','refused'); end $$;
reset role;

select k, v from r order by k;
rollback;
