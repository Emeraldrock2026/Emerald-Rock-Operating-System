create or replace function public.guard_project_client()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is not null and (tg_op = 'INSERT' or new.client_id is distinct from old.client_id) then
    if exists (select 1 from public.clients c where c.tenant_id = new.tenant_id and c.id = new.client_id and not c.active) then
      raise exception 'CLIENT_INACTIVE: inactive clients cannot be given new projects' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger projects_guard_client before insert or update on public.projects for each row execute function public.guard_project_client();
revoke execute on function public.guard_project_client() from public, anon, authenticated;

-- Employees may not read clients, but may see the client name of projects they are allocated to.
create or replace function public.my_project_client_names(_tenant uuid)
returns table(project_id uuid, client_name text)
language sql stable security definer set search_path = public as $$
  select p.id, c.name
  from public.projects p
  join public.clients c on c.tenant_id = p.tenant_id and c.id = p.client_id
  where p.tenant_id = _tenant
    and public.module_enabled(_tenant, 'clients_projects')
    and public.is_active_member(_tenant)
    and (public.is_tenant_manager(_tenant) or public.employee_allocated_to(_tenant, p.id))
$$;
revoke execute on function public.my_project_client_names(uuid) from public, anon;
grant execute on function public.my_project_client_names(uuid) to authenticated;