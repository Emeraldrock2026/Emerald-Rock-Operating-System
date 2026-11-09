-- Branding and appearance access checks. Run through the backend SQL tool; everything rolls back.
-- Expected: admin_branding_rows=1, admin_upload=allowed, dan_sees_rm_prefs=0, erc_accent_unchanged=<ERC accent>,
--           rm_branding_rows=0, rm_sees_dan_prefs=0, rm_upload=refused, rm_write_dan_prefs=refused
-- Ids: Harbour Planning 8a22502a-…, Emerald Rock 9dc6a64c-…, Dan (Owner/Admin) 7f62dbef-…, info@ (Resource Manager on Harbour) a6a521aa-…
begin;
create temp table r(k text, v text) on commit drop;
grant all on r to authenticated;
select set_config('request.jwt.claims', '{"sub":"a6a521aa-4a96-447a-9eaf-37a96823915f","role":"authenticated"}', true);
set local role authenticated;
with u as (update public.tenants set brand_colour='#FF0000' where id='8a22502a-072a-4d17-92b2-03f6482ff26a' returning 1) insert into r select 'rm_branding_rows', count(*)::text from u;
insert into r select 'rm_sees_dan_prefs', count(*)::text from public.user_preferences where user_id='7f62dbef-3d8c-428c-8f90-904bd01ea448';
do $$ begin insert into public.user_preferences(user_id, appearance) values ('7f62dbef-3d8c-428c-8f90-904bd01ea448','dark'); insert into r values ('rm_write_dan_prefs','ALLOWED'); exception when others then insert into r values ('rm_write_dan_prefs','refused'); end $$;
do $$ begin insert into storage.objects(bucket_id, name) values ('tenant-branding','8a22502a-072a-4d17-92b2-03f6482ff26a/x.png'); insert into r values ('rm_upload','ALLOWED'); exception when others then insert into r values ('rm_upload','refused'); end $$;
insert into public.user_preferences(user_id, appearance) values ('a6a521aa-4a96-447a-9eaf-37a96823915f','dark');
reset role;
select set_config('request.jwt.claims', '{"sub":"7f62dbef-3d8c-428c-8f90-904bd01ea448","role":"authenticated"}', true);
set local role authenticated;
with u as (update public.tenants set accent_colour='#112233' where id='8a22502a-072a-4d17-92b2-03f6482ff26a' returning 1) insert into r select 'admin_branding_rows', count(*)::text from u;
insert into r select 'dan_sees_rm_prefs', count(*)::text from public.user_preferences where user_id='a6a521aa-4a96-447a-9eaf-37a96823915f';
do $$ begin insert into storage.objects(bucket_id, name) values ('tenant-branding','8a22502a-072a-4d17-92b2-03f6482ff26a/x.png'); insert into r values ('admin_upload','allowed'); exception when others then insert into r values ('admin_upload','REFUSED '||sqlerrm); end $$;
insert into r select 'erc_accent_unchanged', accent_colour from public.tenants where id='9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7';
reset role;
select string_agg(k||'='||v, ', ' order by k) from r;
rollback;
