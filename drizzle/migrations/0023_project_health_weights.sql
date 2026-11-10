create table public.project_health_settings (
 project_id uuid primary key, tenant_id uuid not null references public.tenants(id),
 actions_weight integer not null default 30 check(actions_weight between 0 and 100),
 milestones_weight integer not null default 30 check(milestones_weight between 0 and 100),
 qa_weight integer not null default 20 check(qa_weight between 0 and 100),
 commercial_weight integer not null default 20 check(commercial_weight between 0 and 100),
 created_at timestamptz not null default now(), created_by uuid, updated_at timestamptz not null default now(), updated_by uuid, version integer not null default 1,
 foreign key (tenant_id,project_id) references public.projects(tenant_id,id),
 check(actions_weight+milestones_weight+qa_weight+commercial_weight > 0)
);
grant select,insert,update on public.project_health_settings to authenticated;
grant all on public.project_health_settings to service_role;
alter table public.project_health_settings enable row level security;
create policy health_read on public.project_health_settings for select to authenticated using(public.module_enabled(tenant_id,'clients_projects') and public.can_view_project(tenant_id,project_id));
create policy health_insert on public.project_health_settings for insert to authenticated with check(public.module_enabled(tenant_id,'clients_projects') and public.can_manage_project(tenant_id,project_id));
create policy health_update on public.project_health_settings for update to authenticated using(public.module_enabled(tenant_id,'clients_projects') and public.can_manage_project(tenant_id,project_id)) with check(public.module_enabled(tenant_id,'clients_projects') and public.can_manage_project(tenant_id,project_id));
create trigger health_stamp_insert before insert on public.project_health_settings for each row execute function public.stamp_insert();
create trigger health_stamp_update before update on public.project_health_settings for each row execute function public.stamp_update();
create trigger health_audit after insert or update on public.project_health_settings for each row execute function public.write_audit('project_detail');