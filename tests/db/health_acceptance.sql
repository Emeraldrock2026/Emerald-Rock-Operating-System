-- Stage 5: isolated tenants/users/projects only. Every fixture and write rolls back.
begin;
select set_config('request.jwt.claims','',true);
create temp table health_results(k text primary key, ok boolean) on commit drop;
grant all on health_results to authenticated;
insert into tenants(id,business_name,display_name,project_prefix,is_demo) values
 ('00000000-0000-0000-0000-000000000051','Health test A','Health test A','HTA',true),
 ('00000000-0000-0000-0000-000000000052','Health test B','Health test B','HTB',true);
update tenant_modules set enabled=true where tenant_id in ('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000052') and module_id='clients_projects';
update tenant_modules set enabled=true where tenant_id='00000000-0000-0000-0000-000000000051' and module_id in ('commercial','rfis','qa','programmes');
insert into tenant_memberships(tenant_id,user_id,email,role,status) values
 ('00000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000051','health-owner@test.invalid','owner_admin','active'),
 ('00000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000052','health-rm@test.invalid','resource_manager','active'),
 ('00000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000053','health-member@test.invalid','employee','active'),
 ('00000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000054','health-viewer@test.invalid','employee','active'),
 ('00000000-0000-0000-0000-000000000052','10000000-0000-0000-0000-000000000055','health-out@test.invalid','owner_admin','active');
insert into employees(id,tenant_id,full_name,user_id) values
 ('20000000-0000-0000-0000-000000000053','00000000-0000-0000-0000-000000000051','Health member','10000000-0000-0000-0000-000000000053'),
 ('20000000-0000-0000-0000-000000000054','00000000-0000-0000-0000-000000000051','Health viewer','10000000-0000-0000-0000-000000000054');
insert into projects(id,tenant_id,name,status,start_date,planned_finish_date) values
 ('40000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000051','Health isolated','active','2026-01-01','2027-01-01');
insert into project_team(tenant_id,project_id,employee_id,project_role) values
 ('00000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000051','20000000-0000-0000-0000-000000000053','member'),
 ('00000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000051','20000000-0000-0000-0000-000000000054','viewer');
insert into project_modules(tenant_id,project_id,module_id) select '00000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000051',unnest(array['rfis','qa','programmes']);
insert into project_records(tenant_id,project_id,module_id,title,due_date) values ('00000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000051','rfis','Health fixture','2026-11-09');
insert into project_commercials(tenant_id,project_id,original_budget,forecast_final_account) values ('00000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000051',100,110);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000051","role":"authenticated"}',true);
set local role authenticated;
insert into project_health_settings(tenant_id,project_id) values ('00000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000051');
insert into health_results select 'owner_read',count(*)=1 from project_health_settings where project_id='40000000-0000-0000-0000-000000000051';
update project_health_settings set actions_weight=40 where project_id='40000000-0000-0000-0000-000000000051' and version=1;
insert into health_results select 'version_stamp',version=2 and actions_weight=40 from project_health_settings where project_id='40000000-0000-0000-0000-000000000051';
with u as(update project_health_settings set actions_weight=45 where project_id='40000000-0000-0000-0000-000000000051' and version=1 returning 1) insert into health_results select 'stale_edit',count(*)=0 from u;
do $$ begin
 begin update project_health_settings set actions_weight=0,milestones_weight=0,qa_weight=0,commercial_weight=0 where project_id='40000000-0000-0000-0000-000000000051'; insert into health_results values('zero_weights',false); exception when check_violation then insert into health_results values('zero_weights',true); end;
 begin update project_health_settings set qa_weight=101 where project_id='40000000-0000-0000-0000-000000000051'; insert into health_results values('weight_range',false); exception when check_violation then insert into health_results values('weight_range',true); end;
end $$;
reset role;
insert into health_results select 'audit',count(*)=2 from audit_log where record_table='project_health_settings' and record_id='40000000-0000-0000-0000-000000000051';
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000053","role":"authenticated"}',true); set local role authenticated;
insert into health_results select 'member_read',count(*)=1 from project_health_settings where project_id='40000000-0000-0000-0000-000000000051';
insert into health_results select 'member_records',count(*)=1 from project_records where project_id='40000000-0000-0000-0000-000000000051';
insert into health_results select 'member_commercial',count(*)=0 from project_commercials where project_id='40000000-0000-0000-0000-000000000051';
with u as(update project_health_settings set actions_weight=60 where project_id='40000000-0000-0000-0000-000000000051' returning 1) insert into health_results select 'member_write',count(*)=0 from u;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000054","role":"authenticated"}',true);
insert into health_results select 'viewer_read',count(*)=1 from project_health_settings where project_id='40000000-0000-0000-0000-000000000051';
insert into health_results select 'viewer_commercial',count(*)=0 from project_commercials where project_id='40000000-0000-0000-0000-000000000051';
with u as(update project_health_settings set actions_weight=60 where project_id='40000000-0000-0000-0000-000000000051' returning 1) insert into health_results select 'viewer_write',count(*)=0 from u;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000055","role":"authenticated"}',true);
insert into health_results select 'other_business_read',count(*)=0 from project_health_settings where project_id='40000000-0000-0000-0000-000000000051';
insert into health_results values('other_project_access',not can_view_project('00000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000051'));
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000052","role":"authenticated"}',true);
insert into health_results select 'rm_no_commercial',count(*)=0 from project_commercials where project_id='40000000-0000-0000-0000-000000000051';
reset role; select set_config('request.jwt.claims','',true);
update tenant_memberships set commercial_access=true where user_id='10000000-0000-0000-0000-000000000052';
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000052","role":"authenticated"}',true);set local role authenticated;
insert into health_results select 'rm_granted_commercial',count(*)=1 from project_commercials where project_id='40000000-0000-0000-0000-000000000051';
with u as(update project_health_settings set qa_weight=25 where project_id='40000000-0000-0000-0000-000000000051' returning 1) insert into health_results select 'rm_weight_write',count(*)=1 from u;
reset role; select set_config('request.jwt.claims','',true);
update project_modules set enabled=false where project_id='40000000-0000-0000-0000-000000000051' and module_id='rfis';
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000054","role":"authenticated"}',true);set local role authenticated;
insert into health_results select 'module_off_records',count(*)=0 from project_records where project_id='40000000-0000-0000-0000-000000000051';
insert into health_results values('module_off_active',not project_module_active('00000000-0000-0000-0000-000000000051','40000000-0000-0000-0000-000000000051','rfis'));
reset role;select set_config('request.jwt.claims','',true);
update tenant_modules set enabled=false where tenant_id='00000000-0000-0000-0000-000000000051' and module_id in ('commercial','rfis','qa','programmes');
update tenant_modules set enabled=false where tenant_id='00000000-0000-0000-0000-000000000051' and module_id='clients_projects';
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000051","role":"authenticated"}',true);set local role authenticated;
insert into health_results select 'core_off_read',count(*)=0 from project_health_settings where project_id='40000000-0000-0000-0000-000000000051';
with u as(update project_health_settings set actions_weight=65 where project_id='40000000-0000-0000-0000-000000000051' returning 1) insert into health_results select 'core_off_write',count(*)=0 from u;
reset role;
select count(*) filter(where ok) passes, array_agg(k) filter(where not ok) failures from health_results;
rollback;