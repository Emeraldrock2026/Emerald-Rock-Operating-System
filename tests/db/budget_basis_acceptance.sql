-- Budget basis and adjustment checks (dashboard stage 4, part 2). Run through the backend SQL tool; everything rolls back.
-- Uses the Harbour Planning (demo) test project HPD-0001, which already has a commercial row.
-- Expected: backfilled=ok, owner_basis=cost, owner_adj=ALLOWED, zero_adj=refused, blank_reason=refused, adj_update=refused ADJUSTMENT_LOCKED,
--   adj_delete=refused ADJUSTMENT_LOCKED, audit_adj=1, audit_basis=1, rm_no_grant_read=0, rm_no_grant_add=refused,
--   rm_grant_read=1, rm_grant_add=ALLOWED, rm_grant_basis=revenue, member_read=0, member_add=refused, viewer_read=0, outsider_read=0,
--   commercial_off_owner_read=0
begin;
create temp table r(k text, v text) on commit drop;
create temp table ids(k text, v uuid) on commit drop;
grant all on r, ids to authenticated;
insert into ids values ('t','8a22502a-072a-4d17-92b2-03f6482ff26a'), ('p','e977adf3-28db-49d1-87e2-caeb01bc14ad'), ('adm','7f62dbef-3d8c-428c-8f90-904bd01ea448'),
  ('rm','10000000-0000-0000-0000-0000000000c0'), ('mem','10000000-0000-0000-0000-0000000000c1'), ('vw','10000000-0000-0000-0000-0000000000c2'), ('out','10000000-0000-0000-0000-0000000000c3');
select set_config('request.jwt.claims', '', true);
update tenant_modules set enabled = true where tenant_id = (select v from ids where k='t') and module_id = 'commercial';
insert into tenant_memberships (tenant_id, user_id, email, role, status) values
  ((select v from ids where k='t'), (select v from ids where k='rm'), 'crm@test.invalid', 'resource_manager', 'active'),
  ((select v from ids where k='t'), (select v from ids where k='mem'), 'cmem@test.invalid', 'employee', 'active'),
  ((select v from ids where k='t'), (select v from ids where k='vw'), 'cvw@test.invalid', 'employee', 'active'),
  ('9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7', (select v from ids where k='out'), 'cout@test.invalid', 'owner_admin', 'active');
insert into employees (tenant_id, full_name, user_id) values
  ((select v from ids where k='t'), 'CMem', (select v from ids where k='mem')), ((select v from ids where k='t'), 'CView', (select v from ids where k='vw'));
insert into project_team (tenant_id, project_id, employee_id, project_role)
  select e.tenant_id, (select v from ids where k='p'), e.id, case when e.user_id = (select v from ids where k='mem') then 'member' else 'viewer' end
  from employees e where e.user_id in ((select v from ids where k='mem'), (select v from ids where k='vw'));
insert into r select 'backfilled', case when count(*) = count(*) filter (where original_budget is not distinct from agreed_fee) then 'ok' else 'MISMATCH' end from project_commercials;

create or replace function pg_temp.as_user(who text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k=who), 'role', 'authenticated')::text, true); end $$;
create or replace function pg_temp.try(label text, sql text) returns void language plpgsql as $$
begin execute sql; insert into r values (label, 'ALLOWED');
exception when others then insert into r values (label, 'refused ' || split_part(sqlerrm, ':', 1)); end $$;
create or replace function pg_temp.add_sql(amt numeric, reason text) returns text language sql as $$
  select format('insert into budget_adjustments (tenant_id, project_id, amount, reason, effective_on) values (%L, %L, %s, %L, current_date)', (select v from ids where k='t'), (select v from ids where k='p'), amt, reason) $$;

select pg_temp.as_user('adm'); set local role authenticated;
update project_commercials set budget_basis = 'cost' where project_id = (select v from ids where k='p');
insert into r select 'owner_basis', budget_basis from project_commercials where project_id = (select v from ids where k='p');
select pg_temp.try('owner_adj', pg_temp.add_sql(5000, 'Client instructed extra survey'));
select pg_temp.try('zero_adj', pg_temp.add_sql(0, 'Nothing'));
select pg_temp.try('blank_reason', pg_temp.add_sql(100, '  '));
reset role;
-- even the database owner cannot change or remove an adjustment
select pg_temp.try('adj_update', 'update budget_adjustments set amount = 1');
select pg_temp.try('adj_delete', 'delete from budget_adjustments');
insert into r select 'audit_adj', count(*)::text from audit_log where record_table = 'budget_adjustments' and action ilike '%insert%' and occurred_at >= now() - interval '1 minute' and new_values->>'reason' = 'Client instructed extra survey';
insert into r select 'audit_basis', count(*)::text from audit_log where record_table = 'project_commercials' and occurred_at >= now() - interval '1 minute' and new_values->>'budget_basis' = 'cost';

select pg_temp.as_user('rm'); set local role authenticated;
insert into r select 'rm_no_grant_read', count(*)::text from budget_adjustments where project_id = (select v from ids where k='p');
select pg_temp.try('rm_no_grant_add', pg_temp.add_sql(10, 'RM without grant'));
reset role;
select set_config('request.jwt.claims', '', true);
update tenant_memberships set commercial_access = true where user_id = (select v from ids where k='rm');
select pg_temp.as_user('rm'); set local role authenticated;
insert into r select 'rm_grant_read', count(*)::text from budget_adjustments where project_id = (select v from ids where k='p');
select pg_temp.try('rm_grant_add', pg_temp.add_sql(-750, 'RM reduction'));
update project_commercials set budget_basis = 'revenue' where project_id = (select v from ids where k='p');
insert into r select 'rm_grant_basis', budget_basis from project_commercials where project_id = (select v from ids where k='p');
reset role;

select pg_temp.as_user('mem'); set local role authenticated;
insert into r select 'member_read', count(*)::text from budget_adjustments where project_id = (select v from ids where k='p');
select pg_temp.try('member_add', pg_temp.add_sql(10, 'member'));
reset role;
select pg_temp.as_user('vw'); set local role authenticated;
insert into r select 'viewer_read', count(*)::text from budget_adjustments where project_id = (select v from ids where k='p'); reset role;
select pg_temp.as_user('out'); set local role authenticated;
insert into r select 'outsider_read', count(*)::text from budget_adjustments where project_id = (select v from ids where k='p'); reset role;

select set_config('request.jwt.claims', '', true);
update tenant_modules set enabled = false where tenant_id = (select v from ids where k='t') and module_id = 'commercial';
select pg_temp.as_user('adm'); set local role authenticated;
insert into r select 'commercial_off_owner_read', count(*)::text from budget_adjustments where project_id = (select v from ids where k='p'); reset role;
select set_config('request.jwt.claims', '', true);
select string_agg(k||'='||v, ' ; ' order by k) res from r;
rollback;
