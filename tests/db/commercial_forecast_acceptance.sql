-- Commercial forecast checks (dashboard stage 4). Run through the backend SQL tool; everything rolls back.
-- Uses the Harbour Planning test project HPD-0001 and its draft change. Dan is Owner/Admin.
-- Works whether or not the demo project already has figures: forecast and estimate are upserted (a new forecast value forces a fresh stamp).
-- Expected: owner_forecast=1, stamped=today, stamp_spoof=ignored, owner_estimate=ok, not_a_change=refused NOT_A_CHANGE,
--   rm_no_grant_fees=0, rm_no_grant_est=0, rm_no_grant_write=refused, rm_grant_fees=1, rm_grant_est=1,
--   member_fees=0, member_est=0, viewer_fees=0, viewer_est=0, outsider_fees=0, outsider_est=0,
--   cc_off_owner_est=1, cc_off_write=refused, commercial_off_owner_fees=0, commercial_off_owner_est=0
begin;
select set_config('request.jwt.claims', '', true);
create temp table r(k text, v text) on commit drop;
create temp table ids(k text, v uuid) on commit drop;
grant all on r, ids to authenticated;
insert into ids values ('t','8a22502a-072a-4d17-92b2-03f6482ff26a'), ('p','e977adf3-28db-49d1-87e2-caeb01bc14ad'), ('adm','7f62dbef-3d8c-428c-8f90-904bd01ea448'),
  ('ch','d23f6dd9-f770-42fc-90bf-df705d200f86'), ('rfi','84bd26fc-6118-449a-895a-815826ad497f'),
  ('rm','10000000-0000-0000-0000-0000000000b0'), ('mem','10000000-0000-0000-0000-0000000000b1'), ('vw','10000000-0000-0000-0000-0000000000b2'), ('out','10000000-0000-0000-0000-0000000000b3');
update tenant_modules set enabled = true where tenant_id = (select v from ids where k='t') and module_id = 'commercial';
insert into tenant_memberships (tenant_id, user_id, email, role, status) values
  ((select v from ids where k='t'), (select v from ids where k='rm'), 'brm@test.invalid', 'resource_manager', 'active'),
  ((select v from ids where k='t'), (select v from ids where k='mem'), 'bmem@test.invalid', 'employee', 'active'),
  ((select v from ids where k='t'), (select v from ids where k='vw'), 'bvw@test.invalid', 'employee', 'active'),
  ('9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7', (select v from ids where k='out'), 'bout@test.invalid', 'owner_admin', 'active');
insert into employees (tenant_id, full_name, user_id) values
  ((select v from ids where k='t'), 'BMem', (select v from ids where k='mem')), ((select v from ids where k='t'), 'BView', (select v from ids where k='vw'));
insert into project_team (tenant_id, project_id, employee_id, project_role)
  select e.tenant_id, (select v from ids where k='p'), e.id, case when e.user_id = (select v from ids where k='mem') then 'member' else 'viewer' end
  from employees e where e.user_id in ((select v from ids where k='mem'), (select v from ids where k='vw'));

create or replace function pg_temp.as_user(who text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k=who), 'role', 'authenticated')::text, true); end $$;
create or replace function pg_temp.try(label text, sql text) returns void language plpgsql as $$
begin execute sql; insert into r values (label, 'ALLOWED');
exception when others then insert into r values (label, 'refused ' || split_part(sqlerrm, ':', 1)); end $$;
create or replace function pg_temp.reads(who text) returns void language plpgsql as $$
begin
  insert into r select who || '_fees', count(*)::text from project_commercials where project_id = (select v from ids where k='p');
  insert into r select who || '_est', count(*)::text from change_estimates where project_id = (select v from ids where k='p');
end $$;

select pg_temp.as_user('adm'); set local role authenticated;
with u as (insert into project_commercials (project_id, tenant_id, agreed_fee, forecast_final_account) values ((select v from ids where k='p'), (select v from ids where k='t'), 100000, 112600)
  on conflict (project_id) do update set agreed_fee = excluded.agreed_fee, forecast_final_account = excluded.forecast_final_account returning 1)
  insert into r select 'owner_forecast', count(*)::text from u;
insert into r select 'stamped', case when forecast_updated_on = tenant_today((select v from ids where k='t')) then 'today' else coalesce(forecast_updated_on::text, 'null') end from project_commercials where project_id = (select v from ids where k='p');
update project_commercials set forecast_updated_on = '2020-01-01' where project_id = (select v from ids where k='p');
insert into r select 'stamp_spoof', case when forecast_updated_on = tenant_today((select v from ids where k='t')) then 'ignored' else 'ACCEPTED' end from project_commercials where project_id = (select v from ids where k='p');
insert into change_estimates (record_id, tenant_id, project_id, amount) values ((select v from ids where k='ch'), (select v from ids where k='t'), (select v from ids where k='p'), 4250)
  on conflict (record_id) do update set amount = excluded.amount;
insert into r values ('owner_estimate', 'ok');
select pg_temp.try('not_a_change', format('insert into change_estimates (record_id, tenant_id, project_id, amount) values (%L, %L, %L, 1)', (select v from ids where k='rfi'), (select v from ids where k='t'), (select v from ids where k='p')));
reset role;

select pg_temp.as_user('rm'); set local role authenticated;
insert into r select 'rm_no_grant_fees', count(*)::text from project_commercials where project_id = (select v from ids where k='p');
insert into r select 'rm_no_grant_est', count(*)::text from change_estimates where project_id = (select v from ids where k='p');
select pg_temp.try('rm_no_grant_write', format('update change_estimates set amount = 1 where record_id = %L returning 1', (select v from ids where k='ch')));
reset role;
-- an update hitting no rows is not an error; record it as refused when nothing changed
update r set v = case when (select amount from change_estimates where record_id = (select v from ids where k='ch')) = 4250 then 'refused' else 'CHANGED' end where k = 'rm_no_grant_write';
select set_config('request.jwt.claims', '', true);
update tenant_memberships set commercial_access = true where user_id = (select v from ids where k='rm');
select pg_temp.as_user('rm'); set local role authenticated;
insert into r select 'rm_grant_fees', count(*)::text from project_commercials where project_id = (select v from ids where k='p');
insert into r select 'rm_grant_est', count(*)::text from change_estimates where project_id = (select v from ids where k='p');
reset role;

select pg_temp.as_user('mem'); set local role authenticated; select pg_temp.reads('member'); reset role;
select pg_temp.as_user('vw'); set local role authenticated; select pg_temp.reads('viewer'); reset role;
select pg_temp.as_user('out'); set local role authenticated; select pg_temp.reads('outsider'); reset role;

-- Change control off for the project: estimates stay readable to commercial project admins, but cannot be changed
select set_config('request.jwt.claims', '', true);
delete from project_modules where project_id = (select v from ids where k='p') and module_id = 'change_control';
select pg_temp.as_user('adm'); set local role authenticated;
insert into r select 'cc_off_owner_est', count(*)::text from change_estimates where project_id = (select v from ids where k='p');
with u as (update change_estimates set amount = 1 where record_id = (select v from ids where k='ch') returning 1) insert into r select 'cc_off_write', case when count(*) = 0 then 'refused' else 'ALLOWED' end from u;
reset role;

-- Commercial switched off for the business: nobody sees money, not even the Owner/Admin
select set_config('request.jwt.claims', '', true);
update tenant_modules set enabled = false where tenant_id = (select v from ids where k='t') and module_id = 'commercial';
select pg_temp.as_user('adm'); set local role authenticated; select pg_temp.reads('commercial_off_owner'); reset role;
select set_config('request.jwt.claims', '', true);
select string_agg(k||'='||v, ' ; ' order by k) res from r;
rollback;
