ALTER TABLE public.clients ADD COLUMN profile jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN client_reference text, ADD COLUMN verification_source text, ADD COLUMN verified_at timestamptz, ADD COLUMN verified_by uuid;
CREATE TABLE public.client_groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),created_at timestamptz NOT NULL DEFAULT now(),created_by uuid,updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid,version integer NOT NULL DEFAULT 1,UNIQUE(tenant_id,id));
GRANT SELECT,INSERT,UPDATE ON public.client_groups TO authenticated; GRANT ALL ON public.client_groups TO service_role;
ALTER TABLE public.client_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_groups_read ON public.client_groups FOR SELECT TO authenticated USING(public.is_tenant_manager(tenant_id) AND public.module_enabled(tenant_id,'clients_projects'));
CREATE POLICY client_groups_insert ON public.client_groups FOR INSERT TO authenticated WITH CHECK(public.is_tenant_manager(tenant_id) AND public.module_enabled(tenant_id,'clients_projects'));
CREATE POLICY client_groups_update ON public.client_groups FOR UPDATE TO authenticated USING(public.is_tenant_manager(tenant_id) AND public.module_enabled(tenant_id,'clients_projects')) WITH CHECK(public.is_tenant_manager(tenant_id) AND public.module_enabled(tenant_id,'clients_projects'));
ALTER TABLE public.clients ADD COLUMN group_id uuid, ADD CONSTRAINT clients_group_tenant_fk FOREIGN KEY(tenant_id,group_id) REFERENCES public.client_groups(tenant_id,id);
CREATE TABLE public.client_contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,client_id uuid NOT NULL,name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),position text NOT NULL DEFAULT '',email text,telephone text NOT NULL DEFAULT '',division text NOT NULL DEFAULT '',roles text[] NOT NULL DEFAULT '{}',active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid,updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid,version integer NOT NULL DEFAULT 1,UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,client_id) REFERENCES public.clients(tenant_id,id),CHECK(email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),CHECK(roles <@ ARRAY['relationship','project','commercial','fee_approver','timesheet_approver','invoice_approver','accounts_payable','payment_escalation']::text[]));
GRANT SELECT,INSERT,UPDATE ON public.client_contacts TO authenticated;GRANT ALL ON public.client_contacts TO service_role;
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_contacts_read ON public.client_contacts FOR SELECT TO authenticated USING(public.is_tenant_manager(tenant_id) AND public.module_enabled(tenant_id,'clients_projects'));
CREATE POLICY client_contacts_insert ON public.client_contacts FOR INSERT TO authenticated WITH CHECK(public.is_tenant_manager(tenant_id) AND public.module_enabled(tenant_id,'clients_projects'));
CREATE POLICY client_contacts_update ON public.client_contacts FOR UPDATE TO authenticated USING(public.is_tenant_manager(tenant_id) AND public.module_enabled(tenant_id,'clients_projects')) WITH CHECK(public.is_tenant_manager(tenant_id) AND public.module_enabled(tenant_id,'clients_projects'));
CREATE TABLE public.client_profile_changes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,client_id uuid NOT NULL,expected_version integer NOT NULL,proposed_name text NOT NULL,proposed_profile jsonb NOT NULL,proposed_group_id uuid,reason text NOT NULL CHECK(length(btrim(reason))>0),status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','rejected')),submitted_by uuid NOT NULL,submitted_at timestamptz NOT NULL DEFAULT now(),reviewed_by uuid,reviewed_at timestamptz,FOREIGN KEY(tenant_id,client_id) REFERENCES public.clients(tenant_id,id),FOREIGN KEY(tenant_id,proposed_group_id) REFERENCES public.client_groups(tenant_id,id));
GRANT SELECT ON public.client_profile_changes TO authenticated;GRANT ALL ON public.client_profile_changes TO service_role;
ALTER TABLE public.client_profile_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_changes_read ON public.client_profile_changes FOR SELECT TO authenticated USING(public.is_tenant_manager(tenant_id) AND public.module_enabled(tenant_id,'clients_projects'));
CREATE OR REPLACE FUNCTION public.guard_client_profile() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE k text;n text;
BEGIN
IF jsonb_typeof(NEW.profile) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_CLIENT_PROFILE';END IF;
FOR k IN SELECT jsonb_object_keys(NEW.profile) LOOP
IF k NOT IN('legal_name','registration_number','jurisdiction','registered_address','correspondence_address','website','vat_number','division','regions','sectors','client_type','accounting_contact_id','relationship_owner','relationship_status','next_action','next_action_due') OR jsonb_typeof(NEW.profile->k) <> 'string' OR length(NEW.profile->>k)>4000 THEN RAISE EXCEPTION 'INVALID_CLIENT_PROFILE';END IF;
END LOOP;
IF coalesce(NEW.profile->>'relationship_status','prospect') NOT IN('prospect','active','dormant','closed') THEN RAISE EXCEPTION 'INVALID_RELATIONSHIP_STATUS';END IF;
n:=coalesce(NEW.profile->>'registration_number','');
IF lower(NEW.profile->>'jurisdiction') IN('uk','united kingdom','england and wales','scotland','northern ireland') AND n<>'' AND lower(btrim(n)) NOT IN('tba','unknown','pending','n/a') AND n !~* '^([0-9]{8}|[A-Z]{2}[0-9]{6}|[A-Z]{2}[0-9]{5}[A-Z0-9])$' THEN RAISE EXCEPTION 'INVALID_REGISTRATION_NUMBER'; END IF;
IF coalesce(NEW.profile->>'next_action_due','')<>'' THEN PERFORM (NEW.profile->>'next_action_due')::date;END IF;
IF TG_OP='INSERT' THEN
NEW.client_reference:='CL-'||upper(replace(NEW.id::text,'-',''));NEW.verified_at:=NULL;NEW.verified_by:=NULL;NEW.verification_source:=NULL;
ELSE
IF NEW.client_reference IS DISTINCT FROM OLD.client_reference THEN RAISE EXCEPTION 'IMMUTABLE_REFERENCE';END IF;
IF (NEW.verified_at IS DISTINCT FROM OLD.verified_at OR NEW.verified_by IS DISTINCT FROM OLD.verified_by OR NEW.verification_source IS DISTINCT FROM OLD.verification_source) AND coalesce(current_setting('app.client_review',true),'')<>NEW.id::text THEN RAISE EXCEPTION 'VERIFICATION_REVIEW_REQUIRED';END IF;
IF OLD.verified_at IS NOT NULL AND (NEW.name IS DISTINCT FROM OLD.name OR NEW.profile IS DISTINCT FROM OLD.profile OR NEW.group_id IS DISTINCT FROM OLD.group_id) AND coalesce(current_setting('app.client_review',true),'')<>NEW.id::text THEN RAISE EXCEPTION 'SENSITIVE_CHANGE_REVIEW_REQUIRED';END IF;
END IF;RETURN NEW;
END $$;
CREATE TRIGGER clients_profile_guard BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.guard_client_profile();
CREATE TRIGGER clients_audit AFTER INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.write_audit('client');
CREATE OR REPLACE FUNCTION public.guard_client_contact() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP='UPDATE' AND NEW.client_id<>OLD.client_id THEN RAISE EXCEPTION 'CONTACT_CLIENT_IMMUTABLE'; END IF; RETURN NEW;END $$;
CREATE TRIGGER contact_guard BEFORE UPDATE ON public.client_contacts FOR EACH ROW EXECUTE FUNCTION public.guard_client_contact();
CREATE TRIGGER contacts_insert BEFORE INSERT ON public.client_contacts FOR EACH ROW EXECUTE FUNCTION public.stamp_insert();
CREATE TRIGGER contacts_update BEFORE UPDATE ON public.client_contacts FOR EACH ROW EXECUTE FUNCTION public.stamp_update();
CREATE TRIGGER contacts_audit AFTER INSERT OR UPDATE ON public.client_contacts FOR EACH ROW EXECUTE FUNCTION public.write_audit('client');
CREATE TRIGGER groups_insert BEFORE INSERT ON public.client_groups FOR EACH ROW EXECUTE FUNCTION public.stamp_insert();
CREATE TRIGGER groups_update BEFORE UPDATE ON public.client_groups FOR EACH ROW EXECUTE FUNCTION public.stamp_update();
CREATE TRIGGER groups_audit AFTER INSERT OR UPDATE ON public.client_groups FOR EACH ROW EXECUTE FUNCTION public.write_audit('client');
CREATE TRIGGER client_changes_audit AFTER INSERT OR UPDATE ON public.client_profile_changes FOR EACH ROW EXECUTE FUNCTION public.write_audit('client');
CREATE OR REPLACE FUNCTION public.submit_client_profile_change(_client uuid,_version integer,_name text,_profile jsonb,_group uuid,_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE c public.clients;v uuid;BEGIN
SELECT * INTO c FROM public.clients WHERE id=_client;
IF c.id IS NULL OR NOT public.is_tenant_manager(c.tenant_id) OR NOT public.module_enabled(c.tenant_id,'clients_projects') THEN RAISE EXCEPTION 'NOT_ALLOWED';END IF;
IF c.version<>_version THEN RAISE EXCEPTION 'STALE_EDIT';END IF;
INSERT INTO public.client_profile_changes(tenant_id,client_id,expected_version,proposed_name,proposed_profile,proposed_group_id,reason,submitted_by) VALUES(c.tenant_id,c.id,_version,_name,_profile,_group,_reason,auth.uid()) RETURNING id INTO v;RETURN v;END $$;
CREATE OR REPLACE FUNCTION public.review_client_profile_change(_change uuid,_accept boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p public.client_profile_changes;c public.clients;BEGIN
SELECT * INTO p FROM public.client_profile_changes WHERE id=_change FOR UPDATE;
IF p.id IS NULL OR NOT public.is_tenant_admin(p.tenant_id) OR NOT public.module_enabled(p.tenant_id,'clients_projects') THEN RAISE EXCEPTION 'NOT_ALLOWED';END IF;
IF p.status<>'pending' THEN RAISE EXCEPTION 'ALREADY_REVIEWED';END IF;
IF _accept THEN SELECT * INTO c FROM public.clients WHERE id=p.client_id FOR UPDATE;IF c.version<>p.expected_version THEN RAISE EXCEPTION 'STALE_EDIT';END IF;
PERFORM set_config('app.client_review',c.id::text,true);
UPDATE public.clients SET name=p.proposed_name,profile=p.proposed_profile,group_id=p.proposed_group_id,verified_at=NULL,verified_by=NULL,verification_source=NULL WHERE id=c.id;
END IF;
UPDATE public.client_profile_changes SET status=CASE WHEN _accept THEN 'accepted' ELSE 'rejected' END,reviewed_by=auth.uid(),reviewed_at=now() WHERE id=p.id;END $$;
CREATE OR REPLACE FUNCTION public.verify_client_profile(_client uuid,_version integer,_source text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE c public.clients;k text;BEGIN
SELECT * INTO c FROM public.clients WHERE id=_client FOR UPDATE;
IF c.id IS NULL OR NOT public.is_tenant_admin(c.tenant_id) OR NOT public.module_enabled(c.tenant_id,'clients_projects') THEN RAISE EXCEPTION 'NOT_ALLOWED';END IF;
IF c.version<>_version THEN RAISE EXCEPTION 'STALE_EDIT';END IF;
IF length(btrim(coalesce(_source,'')))<5 THEN RAISE EXCEPTION 'VERIFICATION_SOURCE_REQUIRED';END IF;
FOREACH k IN ARRAY ARRAY['legal_name','registration_number','jurisdiction','registered_address'] LOOP IF lower(btrim(coalesce(c.profile->>k,''))) IN('','tba','unknown','pending','n/a','to be confirmed','tbc') THEN RAISE EXCEPTION 'IDENTITY_INCOMPLETE';END IF;END LOOP;
PERFORM set_config('app.client_review',c.id::text,true);UPDATE public.clients SET verified_at=now(),verified_by=auth.uid(),verification_source=btrim(_source) WHERE id=c.id;END $$;
REVOKE ALL ON FUNCTION public.submit_client_profile_change(uuid,integer,text,jsonb,uuid,text),public.review_client_profile_change(uuid,boolean),public.verify_client_profile(uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_client_profile_change(uuid,integer,text,jsonb,uuid,text),public.review_client_profile_change(uuid,boolean),public.verify_client_profile(uuid,integer,text) TO authenticated,service_role;