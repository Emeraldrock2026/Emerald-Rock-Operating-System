alter function public.prevent_audit_change() set search_path = public;

-- Trigger functions: never callable directly.
revoke execute on function
  public.stamp_insert(), public.stamp_update(), public.prevent_audit_change(),
  public.guard_tenant_update(), public.validate_tenant_timezone(), public.init_tenant_modules(),
  public.guard_tenant_module(), public.guard_membership_update(), public.write_audit(),
  public.assign_project_reference(), public.guard_allocation(), public.guard_project_status(),
  public.guard_employee(), public.init_employee_pattern(), public.flag_inactive_employee_allocations(),
  public.guard_working_pattern(), public.guard_tenant_currency()
from public, anon, authenticated;

-- Access helpers used by policies, and self-service calls: signed-in users only.
revoke execute on function
  public.is_platform_admin(), public.has_membership(uuid), public.is_active_member(uuid),
  public.has_tenant_role(uuid, public.tenant_role[]), public.is_tenant_admin(uuid), public.is_tenant_manager(uuid),
  public.module_enabled(uuid, text), public.has_commercial_access(uuid), public.tenant_today(uuid),
  public.current_employee_id(uuid), public.employee_allocated_to(uuid, uuid),
  public.activate_my_memberships(), public.claim_platform_admin()
from public, anon;
grant execute on function
  public.is_platform_admin(), public.has_membership(uuid), public.is_active_member(uuid),
  public.has_tenant_role(uuid, public.tenant_role[]), public.is_tenant_admin(uuid), public.is_tenant_manager(uuid),
  public.module_enabled(uuid, text), public.has_commercial_access(uuid), public.tenant_today(uuid),
  public.current_employee_id(uuid), public.employee_allocated_to(uuid, uuid),
  public.activate_my_memberships(), public.claim_platform_admin()
to authenticated, service_role;