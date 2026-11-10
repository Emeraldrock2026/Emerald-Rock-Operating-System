-- D6 isolated fixtures; all changes roll back.
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

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000051","role":"authenticated"}',true);set local role authenticated;
insert into tenant_dashboard_settings(tenant_id) values ('00000000-0000-0000-0000-000000000051');
insert into health_results select 'owner_defaults',config->'weights'->>'actions'='30' from tenant_dashboard_settings;
update tenant_dashboard_settings set config=jsonb_set(config,'{freshness,milestones}','14') where tenant_id='00000000-0000-0000-0000-000000000051' and version=1;
insert into health_results select 'version_and_value',version=2 and config->'freshness'->>'milestones'='14' from tenant_dashboard_settings;
with u as(update tenant_dashboard_settings set config=jsonb_set(config,'{freshness,milestones}','21') where tenant_id='00000000-0000-0000-0000-000000000051' and version=1 returning 1) insert into health_results select 'stale_no_write',count(*)=0 from u;
do $$ begin
 begin update tenant_dashboard_settings set config=jsonb_set(config,'{freshness,milestones}','0'); insert into health_results values('invalid_freshness',false); exception when others then insert into health_results values('invalid_freshness',sqlerrm like 'INVALID_FRESHNESS%'); end;
 begin update tenant_dashboard_settings set config=jsonb_set(config,'{widgets}','["health","health"]'); insert into health_results values('duplicate_widgets',false); exception when others then insert into health_results values('duplicate_widgets',sqlerrm like 'INVALID_DASHBOARD_WIDGETS%'); end;
 begin update tenant_dashboard_settings set config=jsonb_set(config,'{weights}','{"actions":0,"milestones":0,"qa":0,"commercial":0}'); insert into health_results values('zero_weights',false); exception when others then insert into health_results values('zero_weights',sqlerrm like 'INVALID_HEALTH_WEIGHTS%'); end;
 begin update tenant_dashboard_settings set config=jsonb_set(config,'{statusMappings}','{"qa":{"failed":"purple"}}'); insert into health_results values('invalid_status',false); exception when others then insert into health_results values('invalid_status',sqlerrm like 'INVALID_STATUS_MAPPING%'); end;
 begin delete from tenant_dashboard_settings where tenant_id='00000000-0000-0000-0000-000000000051'; insert into health_results values('no_delete',false); exception when insufficient_privilege then insert into health_results values('no_delete',true); end;
end $$;
reset role;
insert into health_results select 'audited',count(*)=2 from audit_log where record_table='tenant_dashboard_settings' and tenant_id='00000000-0000-0000-0000-000000000051';
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000052","role":"authenticated"}',true);set local role authenticated;
insert into health_results select 'resource_manager_read',count(*)=1 from tenant_dashboard_settings where tenant_id='00000000-0000-0000-0000-000000000051';
with u as(update tenant_dashboard_settings set config=jsonb_set(config,'{freshness,commercial}','7') where tenant_id='00000000-0000-0000-0000-000000000051' returning 1) insert into health_results select 'resource_manager_no_write',count(*)=0 from u;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000053","role":"authenticated"}',true);set local role authenticated;
insert into health_results select 'member_read',count(*)=1 from tenant_dashboard_settings where tenant_id='00000000-0000-0000-0000-000000000051';
with u as(update tenant_dashboard_settings set config=jsonb_set(config,'{freshness,commercial}','7') where tenant_id='00000000-0000-0000-0000-000000000051' returning 1) insert into health_results select 'member_no_write',count(*)=0 from u;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000054","role":"authenticated"}',true);set local role authenticated;
insert into health_results select 'viewer_read',count(*)=1 from tenant_dashboard_settings where tenant_id='00000000-0000-0000-0000-000000000051';
with u as(update tenant_dashboard_settings set config=jsonb_set(config,'{freshness,commercial}','7') where tenant_id='00000000-0000-0000-0000-000000000051' returning 1) insert into health_results select 'viewer_no_write',count(*)=0 from u;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000055","role":"authenticated"}',true);set local role authenticated;
insert into health_results select 'outsider_read',count(*)=0 from tenant_dashboard_settings where tenant_id='00000000-0000-0000-0000-000000000051';
with u as(update tenant_dashboard_settings set config=jsonb_set(config,'{freshness,commercial}','7') where tenant_id='00000000-0000-0000-0000-000000000051' returning 1) insert into health_results select 'outsider_no_write',count(*)=0 from u;
reset role;
select set_config('request.jwt.claims','',true);
update tenant_modules set enabled=false where tenant_id='00000000-0000-0000-0000-000000000051' and module_id in ('commercial','rfis','qa','programmes');
update tenant_modules set enabled=false where tenant_id='00000000-0000-0000-0000-000000000051' and module_id='clients_projects';
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000051","role":"authenticated"}',true);set local role authenticated;
insert into health_results select 'module_off_read',count(*)=0 from tenant_dashboard_settings where tenant_id='00000000-0000-0000-0000-000000000051';
with u as(update tenant_dashboard_settings set config=jsonb_set(config,'{freshness,commercial}','7') where tenant_id='00000000-0000-0000-0000-000000000051' returning 1) insert into health_results select 'module_off_write',count(*)=0 from u;
reset role;
select count(*) filter(where ok) passes,array_agg(k) filter(where not ok) failures from health_results;
rollback;
