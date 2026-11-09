-- Service-only lookup of an existing login by email (used by the invitation server function).
create or replace function public.auth_user_id_by_email(_email text)
returns uuid language sql stable security definer set search_path = public as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(_email)) limit 1
$$;
revoke execute on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;

-- Records an invitation for an existing login. Caller must be an Owner/Admin of the tenant,
-- or a platform administrator inviting an Owner/Admin. The login is resolved from the email,
-- so callers cannot attach an arbitrary account id.
create or replace function public.add_member_invitation(_tenant uuid, _email text, _role public.tenant_role)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(_email));
  v_user uuid;
  v_existing public.tenant_memberships;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHORISED: sign in first' using errcode = 'P0001';
  end if;
  if not (public.is_tenant_admin(_tenant) or (public.is_platform_admin() and _role = 'owner_admin')) then
    raise exception 'NOT_AUTHORISED: only an Owner/Admin can invite people' using errcode = 'P0001';
  end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL: enter a valid email address' using errcode = 'P0001';
  end if;
  select id into v_user from auth.users where lower(email) = v_email limit 1;
  if v_user is null then
    raise exception 'NO_ACCOUNT: no login exists for that email yet' using errcode = 'P0001';
  end if;
  select * into v_existing from public.tenant_memberships where tenant_id = _tenant and user_id = v_user;
  if found then
    if v_existing.status <> 'removed' then
      raise exception 'ALREADY_MEMBER: that person already has access to this business' using errcode = 'P0001';
    end if;
    update public.tenant_memberships
      set role = _role, status = 'invited', commercial_access = false,
          invited_by = auth.uid(), invited_at = now(), activated_at = null
      where id = v_existing.id
      returning id into v_id;
    return v_id;
  end if;
  insert into public.tenant_memberships (tenant_id, user_id, email, role, status, invited_by)
  values (_tenant, v_user, v_email, _role, 'invited', auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.add_member_invitation(uuid, text, public.tenant_role) from public, anon;
grant execute on function public.add_member_invitation(uuid, text, public.tenant_role) to authenticated, service_role;

-- Platform maintenance (no signed-in user) may retire the last owner; signed-in users may not.
create or replace function public.guard_membership_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id <> old.user_id or new.email <> old.email then
    raise exception 'IMMUTABLE: a membership cannot be moved to another person' using errcode = 'P0001';
  end if;
  if auth.uid() is not null and old.user_id = auth.uid()
     and (new.role is distinct from old.role
          or new.commercial_access is distinct from old.commercial_access
          or (new.status is distinct from old.status and not (old.status = 'invited' and new.status = 'active'))) then
    raise exception 'SELF_CHANGE: you cannot change your own role, access or status' using errcode = 'P0001';
  end if;
  if new.role <> 'resource_manager' then
    new.commercial_access := false;
  end if;
  if new.status = 'active' and old.status = 'invited' and new.activated_at is null then
    new.activated_at := now();
  end if;
  if auth.uid() is not null
     and old.role = 'owner_admin' and old.status = 'active'
     and (new.role <> 'owner_admin' or new.status <> 'active')
     and not exists (
       select 1 from public.tenant_memberships m
       where m.tenant_id = old.tenant_id and m.id <> old.id and m.role = 'owner_admin' and m.status = 'active'
     ) then
    raise exception 'LAST_OWNER: a business must keep at least one active Owner/Admin' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.guard_membership_update() from public, anon, authenticated;