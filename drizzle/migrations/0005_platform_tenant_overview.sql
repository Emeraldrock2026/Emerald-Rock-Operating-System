create or replace function public.platform_tenant_overview()
returns table (
  tenant_id uuid, business_name text, display_name text, project_prefix text,
  status public.tenant_status, is_demo boolean, created_at timestamptz, version integer,
  owners_active integer, owners_invited integer, members_active integer, modules_enabled text[]
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_AUTHORISED: platform administrators only' using errcode = 'P0001';
  end if;
  return query
  select t.id, t.business_name, t.display_name, t.project_prefix, t.status, t.is_demo, t.created_at, t.version,
    (select count(*)::int from tenant_memberships m where m.tenant_id = t.id and m.role = 'owner_admin' and m.status = 'active'),
    (select count(*)::int from tenant_memberships m where m.tenant_id = t.id and m.role = 'owner_admin' and m.status = 'invited'),
    (select count(*)::int from tenant_memberships m where m.tenant_id = t.id and m.status = 'active'),
    coalesce((select array_agg(tm.module_id order by tm.module_id) from tenant_modules tm where tm.tenant_id = t.id and tm.enabled), '{}')
  from tenants t
  order by t.display_name;
end $$;
revoke all on function public.platform_tenant_overview() from public, anon;
grant execute on function public.platform_tenant_overview() to authenticated;