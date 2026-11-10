-- Budget basis per project and an original budget; adjustments are append-only and audited.
alter table public.project_commercials
  add column budget_basis text not null default 'revenue' check (budget_basis in ('expenditure','revenue','cost')),
  add column original_budget numeric check (original_budget is null or (original_budget >= 0 and original_budget <= 999999999.99));
update public.project_commercials set original_budget = agreed_fee where original_budget is null;

create table public.budget_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  amount numeric not null check (amount <> 0 and amount >= -999999999.99 and amount <= 999999999.99),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  effective_on date not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  foreign key (project_id, tenant_id) references public.projects(id, tenant_id)
);
create index budget_adjustments_project_idx on public.budget_adjustments(project_id, created_at);
grant select, insert on public.budget_adjustments to authenticated;
grant all on public.budget_adjustments to service_role;
alter table public.budget_adjustments enable row level security;
create policy "Commercial users see budget adjustments" on public.budget_adjustments
  for select to authenticated using (public.has_commercial_access(tenant_id) and public.can_view_project(tenant_id, project_id));
create policy "Commercial users add budget adjustments" on public.budget_adjustments
  for insert to authenticated with check (public.has_commercial_access(tenant_id) and public.can_view_project(tenant_id, project_id));

create or replace function public.guard_budget_adjustment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then raise exception 'ADJUSTMENT_LOCKED: budget adjustments cannot be changed or removed; add a reversing adjustment'; end if;
  new.created_at := now();
  new.created_by := coalesce(auth.uid(), new.created_by);
  new.reason := btrim(new.reason);
  if new.effective_on is null then new.effective_on := public.tenant_today(new.tenant_id); end if;
  return new;
end $$;
revoke all on function public.guard_budget_adjustment() from public, anon, authenticated;
create trigger budget_adjustments_guard before insert or update or delete on public.budget_adjustments for each row execute function public.guard_budget_adjustment();
create trigger budget_adjustments_audit after insert on public.budget_adjustments for each row execute function public.write_audit('commercial');