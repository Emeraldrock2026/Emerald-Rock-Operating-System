-- project_role_of() returns null for non-members, which made "x or role = 'project_admin'" null rather than false,
-- so "if not can_manage_project(...)" checks in functions were skipped. Helpers now always return true/false.
create or replace function public.can_view_project(_tenant uuid, _project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.module_enabled(_tenant, 'clients_projects') and (
    public.is_tenant_manager(_tenant)
    or public.project_role_of(_tenant, _project) is not null
    or (public.module_enabled(_tenant, 'resource_planning') and public.is_active_member(_tenant)
        and public.employee_allocated_to(_tenant, _project))), false)
$$;
create or replace function public.can_contribute_project(_tenant uuid, _project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.module_enabled(_tenant, 'clients_projects') and (
    public.is_tenant_manager(_tenant) or public.project_role_of(_tenant, _project) in ('project_admin','member')), false)
$$;
create or replace function public.can_manage_project(_tenant uuid, _project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.module_enabled(_tenant, 'clients_projects') and (
    public.is_tenant_manager(_tenant) or public.project_role_of(_tenant, _project) = 'project_admin'), false)
$$;
create or replace function public.project_module_active(_tenant uuid, _project uuid, _module text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.module_enabled(_tenant, _module) and exists (
    select 1 from public.project_modules pm
    where pm.tenant_id = _tenant and pm.project_id = _project and pm.module_id = _module and pm.enabled), false)
$$;