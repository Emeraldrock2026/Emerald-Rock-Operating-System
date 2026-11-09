create or replace function public.guard_allocation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_status public.project_status;
  v_active boolean;
begin
  select active into v_active from public.employees where tenant_id = new.tenant_id and id = new.employee_id;
  if not found then
    raise exception 'CROSS_TENANT_REFERENCE: that person does not belong to this business' using errcode = '23503';
  end if;
  select status into v_status from public.projects where tenant_id = new.tenant_id and id = new.project_id;
  if not found then
    raise exception 'CROSS_TENANT_REFERENCE: that project does not belong to this business' using errcode = '23503';
  end if;
  if (tg_op = 'INSERT' or new.employee_id <> old.employee_id) and not v_active then
    raise exception 'EMPLOYEE_INACTIVE: inactive people cannot receive new allocations' using errcode = 'P0001';
  end if;
  if (tg_op = 'INSERT' or new.project_id <> old.project_id or new.allocation_date <> old.allocation_date)
     and v_status in ('draft', 'completed', 'archived') then
    raise exception 'PROJECT_NOT_ALLOCATABLE: % projects cannot receive allocations', v_status using errcode = 'P0001';
  end if;
  return new;
end $$;