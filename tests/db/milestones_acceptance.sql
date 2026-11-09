-- Milestones checks (dashboard stage 3). Run through the backend SQL tool; everything rolls back.
-- Uses the Harbour Planning test project HPD-0001 (Programmes on). Dan is its project admin.
-- Expected: admin_add=ok, initial_history=1, direct_baseline=refused BASELINE_LOCKED, rebase_no_reason=refused REASON_REQUIRED,
--   rebase=2, history_after=2, history_previous=2026-12-01, history_edit=refused IMMUTABLE, history_delete=refused IMMUTABLE,
--   member_forecast=1, forecast_stamped=today, member_rebase=refused NOT_ALLOWED, member_add=refused, viewer_forecast=0,
--   actual_future=refused ACTUAL_IN_FUTURE, stale_rebase=refused STALE_EDIT, outsider_sees=0, outsider_history=0,
--   off_member_sees=0, off_admin_sees=1, off_admin_edit=0, off_rebase=refused MODULE_OFF
begin;
create temp table r(k text, v text) on commit drop;
create temp table ids(k text, v uuid) on commit drop;
grant all on r, ids to authenticated;
insert into ids values ('t','8a22502a-072a-4d17-92b2-03f6482ff26a'), ('p','e977adf3-28db-49d1-87e2-caeb01bc14ad'), ('adm','7f62dbef-3d8c-428c-8f90-904bd01ea448'),
  ('mem','10000000-0000-0000-0000-0000000000c1'), ('vw','10000000-0000-0000-0000-0000000000c2'), ('out','10000000-0000-0000-0000-0000000000c3');
insert into tenant_memberships (tenant_id, user_id, email, role, status) values
  ((select v from ids where k='t'), (select v from ids where k='mem'), 'cmem@test.invalid', 'employee', 'active'),
  ((select v from ids where k='t'), (select v from ids where k='vw'), 'cvw@test.invalid', 'employee', 'active'),
  ('9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7', (select v from ids where k='out'), 'cout@test.invalid', 'owner_admin', 'active');
insert into employees (tenant_id, full_name, user_id) values
  ((select v from ids where k='t'), 'CMem', (select v from ids where k='mem')), ((select v from ids where k='t'), 'CView', (select v from ids where k='vw'));
insert into project_team (tenant_id, project_id, employee_id, project_role)
  select e.tenant_id, (select v from ids where k='p'), e.id, case when e.user_id = (select v from ids where k='mem') then 'member' else 'viewer' end
  from employees e where e.user_id in ((select v from ids where k='mem'), (select v from ids where k='vw'));

create or replace function pg_temp.as_user(who text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k=who), 'role', 'authenticated')::text, true); end $$;
create or replace function pg_temp.try(label text, sql text) returns void language plpgsql as $$
begin execute sql; insert into r values (label, 'ALLOWED');
exception when others then insert into r values (label, 'refused ' || split_part(sqlerrm, ':', 1)); end $$;

-- Admin adds a milestone with a baseline
select pg_temp.as_user('adm'); set local role authenticated;
insert into project_milestones (tenant_id, project_id, name, baseline_date, forecast_date) values ((select v from ids where k='t'), (select v from ids where k='p'), 'MS test', '2026-12-01', '2026-12-05');
insert into r values ('admin_add','ok');
insert into ids select 'm', id from project_milestones where name = 'MS test';
insert into r select 'initial_history', count(*)::text from milestone_baselines where milestone_id = (select v from ids where k='m');
select pg_temp.try('direct_baseline', format('update project_milestones set baseline_date = %L where id = %L', '2026-12-20', (select v from ids where k='m')));
select pg_temp.try('rebase_no_reason', format('select set_milestone_baseline(%L, %L, %L, (select version from project_milestones where id = %L))', (select v from ids where k='m'), '2026-12-20', '', (select v from ids where k='m')));
insert into r select 'rebase', set_milestone_baseline((select v from ids where k='m'), '2026-12-20', 'Client instruction 4', (select version from project_milestones where id = (select v from ids where k='m')))::text;
insert into r select 'history_after', count(*)::text from milestone_baselines where milestone_id = (select v from ids where k='m');
insert into r select 'history_previous', previous_date::text from milestone_baselines where milestone_id = (select v from ids where k='m') and baseline_no = 2;
select pg_temp.try('stale_rebase', format('select set_milestone_baseline(%L, %L, %L, 1)', (select v from ids where k='m'), '2026-12-24', 'x'));
select pg_temp.try('actual_future', format('update project_milestones set actual_date = current_date + 30 where id = %L', (select v from ids where k='m')));
reset role;
-- Even the database owner cannot rewrite history
select pg_temp.try('history_edit', format('update milestone_baselines set baseline_date = %L where milestone_id = %L', '2026-01-01', (select v from ids where k='m')));
select pg_temp.try('history_delete', format('delete from milestone_baselines where milestone_id = %L', (select v from ids where k='m')));
update project_milestones set forecast_updated_on = '2026-01-01' where id = (select v from ids where k='m');

-- Member updates the forecast; cannot re-baseline or add
select pg_temp.as_user('mem'); set local role authenticated;
with u as (update project_milestones set forecast_date = '2026-12-28' where id = (select v from ids where k='m') returning 1) insert into r select 'member_forecast', count(*)::text from u;
insert into r select 'forecast_stamped', case when forecast_updated_on = (now() at time zone 'Europe/London')::date then 'today' else forecast_updated_on::text end from project_milestones where id = (select v from ids where k='m');
select pg_temp.try('member_rebase', format('select set_milestone_baseline(%L, %L, %L, (select version from project_milestones where id = %L))', (select v from ids where k='m'), '2026-12-30', 'x', (select v from ids where k='m')));
select pg_temp.try('member_add', format('insert into project_milestones (tenant_id, project_id, name) values (%L, %L, %L)', (select v from ids where k='t'), (select v from ids where k='p'), 'M2'));
update r set v = 'refused' where k = 'member_add' and v like 'refused%';
reset role;

-- Viewer cannot change anything
select pg_temp.as_user('vw'); set local role authenticated;
with u as (update project_milestones set forecast_date = '2027-01-10' where id = (select v from ids where k='m') returning 1) insert into r select 'viewer_forecast', count(*)::text from u;
reset role;

-- Another business sees nothing
select pg_temp.as_user('out'); set local role authenticated;
insert into r select 'outsider_sees', count(*)::text from project_milestones where id = (select v from ids where k='m');
insert into r select 'outsider_history', count(*)::text from milestone_baselines where milestone_id = (select v from ids where k='m');
reset role;

-- Programmes switched off for the project
delete from project_modules where project_id = (select v from ids where k='p') and module_id = 'programmes';
select pg_temp.as_user('mem'); set local role authenticated;
insert into r select 'off_member_sees', count(*)::text from project_milestones where id = (select v from ids where k='m');
reset role;
select pg_temp.as_user('adm'); set local role authenticated;
insert into r select 'off_admin_sees', count(*)::text from project_milestones where id = (select v from ids where k='m');
with u as (update project_milestones set forecast_date = '2027-01-10' where id = (select v from ids where k='m') returning 1) insert into r select 'off_admin_edit', count(*)::text from u;
select pg_temp.try('off_rebase', format('select set_milestone_baseline(%L, %L, %L, (select version from project_milestones where id = %L))', (select v from ids where k='m'), '2027-01-05', 'x', (select v from ids where k='m')));
reset role;
select set_config('request.jwt.claims', '', true);
select string_agg(k||'='||v, ' ; ' order by k) res from r;
rollback;
