-- Database acceptance checks for tenant isolation, roles, modules and business rules.
-- Runs entirely inside one transaction and always ends by raising, so nothing is kept.
-- The final error message reports: RESULT passes=<n> fails={...}. Expect fails={}. Run: psql "$SUPABASE_DB_URL" -f tests/db/access_acceptance.sql
do $$
declare
  tA uuid := '00000000-0000-0000-0000-00000000000a';
  tB uuid := '00000000-0000-0000-0000-00000000000b';
  uAdmA uuid := '10000000-0000-0000-0000-000000000001';
  uRmA  uuid := '10000000-0000-0000-0000-000000000002';
  uEmpA uuid := '10000000-0000-0000-0000-000000000003';
  uAdmB uuid := '10000000-0000-0000-0000-000000000004';
  uMulti uuid := '10000000-0000-0000-0000-000000000005';
  uPlat uuid := '10000000-0000-0000-0000-000000000006';
  eA1 uuid := '20000000-0000-0000-0000-000000000001';
  eA2 uuid := '20000000-0000-0000-0000-000000000002';
  eAm uuid := '20000000-0000-0000-0000-000000000003';
  eB1 uuid := '20000000-0000-0000-0000-000000000004';
  cA uuid := '30000000-0000-0000-0000-000000000001';
  cB uuid := '30000000-0000-0000-0000-000000000002';
  pA uuid := '40000000-0000-0000-0000-000000000001';
  pA2 uuid := '40000000-0000-0000-0000-000000000002';
  pB uuid := '40000000-0000-0000-0000-000000000003';
  pDraft uuid := '40000000-0000-0000-0000-000000000004';
  today date;
  n int;
  t text;
  passes int := 0;
  fails text[] := '{}';
begin
  -- ---------- Fixtures (as the service, no user) ----------
  perform set_config('request.jwt.claims', '', true);
  insert into tenants (id, business_name, display_name, project_prefix) values
    (tA, 'Test Tenant A', 'A', 'TTA'), (tB, 'Test Tenant B', 'B', 'TTB');
  update tenant_modules set enabled = true where tenant_id = tA and module_id = 'clients_projects';
  update tenant_modules set enabled = true where tenant_id = tA and module_id in ('resource_planning', 'commercial');
  update tenant_modules set enabled = true where tenant_id = tB and module_id = 'clients_projects';
  insert into platform_admins (user_id, email) values (uPlat, 'plat@test.invalid');
  insert into tenant_memberships (tenant_id, user_id, email, role, status) values
    (tA, uAdmA, 'adma@test.invalid', 'owner_admin', 'active'),
    (tA, uRmA, 'rma@test.invalid', 'resource_manager', 'active'),
    (tA, uEmpA, 'empa@test.invalid', 'employee', 'active'),
    (tB, uAdmB, 'admb@test.invalid', 'owner_admin', 'active'),
    (tA, uMulti, 'multi@test.invalid', 'employee', 'active'),
    (tB, uMulti, 'multi@test.invalid', 'owner_admin', 'active');
  insert into employees (id, tenant_id, full_name, user_id) values
    (eA1, tA, 'Alice A', uEmpA), (eA2, tA, 'Bob A', null), (eAm, tA, 'Multi A', uMulti), (eB1, tB, 'Brenda B', null);
  insert into clients (id, tenant_id, name) values (cA, tA, 'Client A'), (cB, tB, 'Client B');
  today := tenant_today(tA);
  insert into projects (id, tenant_id, name, client_id, status, start_date, planned_finish_date) values
    (pA, tA, 'Project A', cA, 'active', today - 30, today + 60),
    (pA2, tA, 'Project A2', cA, 'active', today - 30, today + 60),
    (pB, tB, 'Project B', cB, 'active', today - 30, today + 60),
    (pDraft, tA, 'Draft A', cA, 'draft', today, today + 10);
  insert into project_commercials (project_id, tenant_id, agreed_fee, budget_hours) values (pA, tA, 10000, 100);
  insert into allocations (tenant_id, employee_id, project_id, allocation_date, hours) values
    (tA, eA1, pA, today + 1, 4), (tA, eA2, pA, today + 1, 7.5), (tA, eA1, pA, today - 1, 3);

  -- T: project references use prefix + 4-digit sequence per tenant
  select count(*) into n from projects where reference in ('TTA-0001', 'TTA-0002', 'TTB-0001', 'TTA-0003');
  if n = 4 then passes := passes + 1; else fails := fails || ('references ' || n); end if;

  -- ---------- Owner/Admin of A ----------
  perform set_config('request.jwt.claims', json_build_object('sub', uAdmA, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from projects;
  if n = 3 then passes := passes + 1; else fails := fails || ('adminA projects ' || n); end if;
  select count(*) into n from projects where tenant_id = tB;
  if n = 0 then passes := passes + 1; else fails := fails || 'adminA sees B projects'; end if;
  select count(*) into n from employees where tenant_id = tB;
  if n = 0 then passes := passes + 1; else fails := fails || 'adminA sees B employees'; end if;
  select count(*) into n from project_commercials;
  if n = 1 then passes := passes + 1; else fails := fails || ('adminA commercials ' || n); end if;
  begin
    insert into projects (tenant_id, name, status, start_date, planned_finish_date) values (tB, 'Sneaky', 'active', today, today);
    fails := fails || 'adminA inserted into B';
  exception when others then passes := passes + 1; end;
  begin
    insert into projects (tenant_id, name, client_id, status, start_date, planned_finish_date) values (tA, 'Cross', cB, 'active', today, today);
    fails := fails || 'cross-tenant client accepted';
  exception when foreign_key_violation then passes := passes + 1; end;
  begin
    insert into allocations (tenant_id, employee_id, project_id, allocation_date, hours) values (tA, eB1, pA, today, 1);
    fails := fails || 'cross-tenant employee accepted';
  exception when foreign_key_violation then passes := passes + 1; end;
  update tenant_modules set enabled = false where tenant_id = tA and module_id = 'commercial';
  get diagnostics n = row_count;
  if n = 0 then passes := passes + 1; else fails := fails || 'tenant admin changed a module'; end if;
  begin
    update tenant_memberships set role = 'employee' where user_id = uAdmA and tenant_id = tA;
    fails := fails || 'self role change allowed';
  exception when others then
    if sqlerrm like 'SELF_CHANGE%' then passes := passes + 1; else fails := fails || ('self change: ' || sqlerrm); end if;
  end;
  begin
    update tenants set status = 'suspended' where id = tA;
    fails := fails || 'tenant admin suspended tenant';
  exception when others then
    if sqlerrm like 'PLATFORM_ONLY%' then passes := passes + 1; else fails := fails || ('suspend: ' || sqlerrm); end if;
  end;
  begin
    insert into audit_log (tenant_id, category, action, record_table) values (tA, 'project', 'insert', 'x');
    fails := fails || 'user wrote audit';
  exception when insufficient_privilege then passes := passes + 1; end;
  select count(*) into n from audit_log where category = 'allocation' and tenant_id = tA;
  if n = 3 then passes := passes + 1; else fails := fails || ('adminA allocation audit ' || n); end if;
  begin
    insert into allocations (tenant_id, employee_id, project_id, allocation_date, hours) values (tA, eA1, pDraft, today, 1);
    fails := fails || 'draft project accepted allocation';
  exception when others then
    if sqlerrm like 'PROJECT_NOT_ALLOCATABLE%' then passes := passes + 1; else fails := fails || ('draft: ' || sqlerrm); end if;
  end;
  begin
    insert into allocations (tenant_id, employee_id, project_id, allocation_date, hours) values (tA, eA1, pA, today, 0);
    fails := fails || 'zero hours accepted';
  exception when check_violation then passes := passes + 1; end;
  begin
    update projects set status = 'completed' where id = pA;
    fails := fails || 'closed project with future allocations';
  exception when others then
    if sqlerrm like 'PROJECT_HAS_FUTURE_ALLOCATIONS%' then passes := passes + 1; else fails := fails || ('close: ' || sqlerrm); end if;
  end;
  begin
    insert into working_patterns (tenant_id, employee_id, effective_from, thu_hours, fri_hours) values (tA, eA1, today - 7, 0, 0);
    fails := fails || 'past pattern rewrote history';
  exception when others then
    if sqlerrm like 'PATTERN_REWRITES_HISTORY%' then passes := passes + 1; else fails := fails || ('pattern: ' || sqlerrm); end if;
  end;
  insert into working_patterns (tenant_id, employee_id, effective_from, thu_hours, fri_hours) values (tA, eA1, today + 1, 0, 0);
  passes := passes + 1;
  begin
    update projects set reference = 'TTA-9999' where id = pA;
    fails := fails || 'reference changed';
  exception when others then passes := passes + 1; end;
  update employees set active = false where id = eA2;
  select count(*) into n from allocations where employee_id = eA2 and needs_review;
  if n = 1 then passes := passes + 1; else fails := fails || ('deactivation flags ' || n); end if;
  begin
    insert into allocations (tenant_id, employee_id, project_id, allocation_date, hours) values (tA, eA2, pA2, today + 2, 1);
    fails := fails || 'inactive employee allocated';
  exception when others then
    if sqlerrm like 'EMPLOYEE_INACTIVE%' then passes := passes + 1; else fails := fails || ('inactive: ' || sqlerrm); end if;
  end;

  -- ---------- Resource Manager of A ----------
  perform set_config('request.jwt.claims', json_build_object('sub', uRmA, 'role', 'authenticated')::text, true);
  select count(*) into n from project_commercials;
  if n = 0 then passes := passes + 1; else fails := fails || 'RM sees commercials without grant'; end if;
  select count(*) into n from allocations;
  if n = 3 then passes := passes + 1; else fails := fails || ('RM allocations ' || n); end if;
  select count(*) into n from audit_log;
  if n = 0 then passes := passes + 1; else fails := fails || ('RM sees audit ' || n); end if;
  begin
    update tenant_memberships set role = 'owner_admin' where user_id = uRmA;
    get diagnostics n = row_count;
    if n = 0 then passes := passes + 1; else fails := fails || 'RM escalated role'; end if;
  exception when others then passes := passes + 1; end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update tenant_memberships set commercial_access = true where user_id = uRmA;
  perform set_config('request.jwt.claims', json_build_object('sub', uRmA, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from project_commercials;
  if n = 1 then passes := passes + 1; else fails := fails || 'RM with grant cannot see commercials'; end if;
  select count(*) into n from audit_log where category = 'commercial';
  if n = 1 then passes := passes + 1; else fails := fails || ('RM commercial audit ' || n); end if;

  -- ---------- Employee of A ----------
  perform set_config('request.jwt.claims', json_build_object('sub', uEmpA, 'role', 'authenticated')::text, true);
  select count(*) into n from project_commercials;
  if n = 0 then passes := passes + 1; else fails := fails || 'employee sees commercials'; end if;
  select count(*) into n from allocations;
  if n = 2 then passes := passes + 1; else fails := fails || ('employee allocations ' || n); end if;
  select count(*) into n from employees;
  if n = 1 then passes := passes + 1; else fails := fails || ('employee sees employees ' || n); end if;
  select count(*) into n from clients;
  if n = 0 then passes := passes + 1; else fails := fails || 'employee sees clients'; end if;
  select count(*) into n from projects;
  if n = 1 then passes := passes + 1; else fails := fails || ('employee projects ' || n); end if;
  begin
    insert into allocations (tenant_id, employee_id, project_id, allocation_date, hours) values (tA, eA1, pA, today, 1);
    fails := fails || 'employee created allocation';
  exception when others then passes := passes + 1; end;

  -- ---------- Multi-tenant user: employee in A, admin in B ----------
  -- Invitations: only Owner/Admins may invite (Employee here); unknown emails need an account first
  begin
    perform add_member_invitation(tA, 'someone@test.invalid', 'employee');
    fails := fails || 'employee could invite';
  exception when others then
    if sqlerrm like 'NOT_AUTHORISED%' then passes := passes + 1; else fails := fails || ('emp invite: ' || sqlerrm); end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', uMulti, 'role', 'authenticated')::text, true);
  select count(*) into n from projects where tenant_id = tA;
  if n = 0 then passes := passes + 1; else fails := fails || ('multi sees A projects ' || n); end if;
  select count(*) into n from projects where tenant_id = tB;
  if n = 1 then passes := passes + 1; else fails := fails || ('multi B projects ' || n); end if;
  select count(*) into n from employees where tenant_id = tB;
  if n = 1 then passes := passes + 1; else fails := fails || ('multi B employees ' || n); end if;

  -- ---------- Admin of B: Resource Planning disabled ----------
  perform set_config('request.jwt.claims', json_build_object('sub', uAdmB, 'role', 'authenticated')::text, true);
  begin
    insert into allocations (tenant_id, employee_id, project_id, allocation_date, hours) values (tB, eB1, pB, today, 1);
    fails := fails || 'allocation allowed with module off';
  exception when others then passes := passes + 1; end;
  select count(*) into n from projects;
  if n = 1 then passes := passes + 1; else fails := fails || ('adminB projects ' || n); end if;

  -- ---------- Platform admin ----------
  perform set_config('request.jwt.claims', json_build_object('sub', uPlat, 'role', 'authenticated')::text, true);
  select count(*) into n from tenants where id in (tA, tB);
  if n = 2 then passes := passes + 1; else fails := fails || ('platform tenants ' || n); end if;
  select count(*) into n from projects;
  if n = 0 then passes := passes + 1; else fails := fails || 'platform admin sees projects'; end if;
  select count(*) into n from employees;
  if n = 0 then passes := passes + 1; else fails := fails || 'platform admin sees employees'; end if;
  select count(*) into n from project_commercials;
  if n = 0 then passes := passes + 1; else fails := fails || 'platform admin sees fees'; end if;
  begin
    perform add_member_invitation(tA, 'someone@test.invalid', 'employee');
    fails := fails || 'platform admin invited an employee';
  exception when others then
    if sqlerrm like 'NOT_AUTHORISED%' then passes := passes + 1; else fails := fails || ('plat invite: ' || sqlerrm); end if;
  end;
  begin
    perform add_member_invitation(tA, 'nobody-here@test.invalid', 'owner_admin');
    fails := fails || 'invitation without account accepted';
  exception when others then
    if sqlerrm like 'NO_ACCOUNT%' then passes := passes + 1; else fails := fails || ('no account: ' || sqlerrm); end if;
  end;
  begin
    update tenant_modules set enabled = false where tenant_id = tA and module_id = 'clients_projects';
    fails := fails || 'disabled module with dependants';
  exception when others then
    if sqlerrm like 'MODULE_HAS_DEPENDANTS%' then passes := passes + 1; else fails := fails || ('dependants: ' || sqlerrm); end if;
  end;
  update tenant_modules set enabled = false where tenant_id = tB and module_id = 'clients_projects';
  begin
    update tenant_modules set enabled = true where tenant_id = tB and module_id = 'resource_planning';
    fails := fails || 'enabled module without dependency';
  exception when others then
    if sqlerrm like 'MODULE_DEPENDENCY_DISABLED%' then passes := passes + 1; else fails := fails || ('dependency: ' || sqlerrm); end if;
  end;
  update tenant_modules set enabled = true where tenant_id = tB and module_id = 'clients_projects';
  update tenant_modules set enabled = false where tenant_id = tA and module_id = 'commercial';
  select count(*) into n from audit_log where category = 'module' and tenant_id in (tA, tB);
  if n >= 3 then passes := passes + 1; else fails := fails || ('platform module audit ' || n); end if;

  -- Commercial disabled: admin A loses fees but keeps projects; re-enabling restores the same row
  perform set_config('request.jwt.claims', json_build_object('sub', uAdmA, 'role', 'authenticated')::text, true);
  select count(*) into n from project_commercials;
  if n = 0 then passes := passes + 1; else fails := fails || 'fees visible with Commercial off'; end if;
  select count(*) into n from projects;
  if n = 3 then passes := passes + 1; else fails := fails || 'projects lost with Commercial off'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uPlat, 'role', 'authenticated')::text, true);
  update tenant_modules set enabled = true where tenant_id = tA and module_id = 'commercial';
  perform set_config('request.jwt.claims', json_build_object('sub', uAdmA, 'role', 'authenticated')::text, true);
  select count(*) into n from project_commercials where agreed_fee = 10000;
  if n = 1 then passes := passes + 1; else fails := fails || 'fees not restored'; end if;

  -- Suspended tenant: all access gone; suspended membership likewise
  perform set_config('request.jwt.claims', json_build_object('sub', uPlat, 'role', 'authenticated')::text, true);
  update tenants set status = 'suspended' where id = tA;
  perform set_config('request.jwt.claims', json_build_object('sub', uAdmA, 'role', 'authenticated')::text, true);
  select count(*) into n from projects;
  if n = 0 then passes := passes + 1; else fails := fails || 'suspended tenant still readable'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update tenants set status = 'active' where id = tA;
  update tenant_memberships set status = 'suspended' where user_id = uRmA;
  perform set_config('request.jwt.claims', json_build_object('sub', uRmA, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from allocations;
  if n = 0 then passes := passes + 1; else fails := fails || 'suspended member still reads'; end if;

  -- Platform overview: setup counts for platform admins only
  perform set_config('request.jwt.claims', json_build_object('sub', uPlat, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select owners_active into n from platform_tenant_overview() where tenant_id = tB;
  if n = 1 then passes := passes + 1; else fails := fails || ('overview owners ' || n); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uAdmA, 'role', 'authenticated')::text, true);
  begin
    perform * from platform_tenant_overview();
    fails := fails || 'tenant admin read platform overview';
  exception when others then
    if sqlerrm like 'NOT_AUTHORISED%' then passes := passes + 1; else fails := fails || ('overview: ' || sqlerrm); end if;
  end;

  execute 'reset role';
  raise exception 'RESULT passes=% fails=%', passes, fails;
end $$;
