-- A procurement package can only be marked ordered once it has been awarded, so the admin-only award step can't be skipped.
create or replace function public.guard_procurement_order()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.module_id = 'procurement' and new.status = 'ordered'
     and (tg_op = 'INSERT' or old.status not in ('awarded','ordered')) then
    raise exception 'ORDER_NEEDS_AWARD';
  end if;
  return new;
end $$;
revoke execute on function public.guard_procurement_order() from public, anon, authenticated;
create trigger guard_procurement_order before insert or update on public.project_records
  for each row execute function public.guard_procurement_order();