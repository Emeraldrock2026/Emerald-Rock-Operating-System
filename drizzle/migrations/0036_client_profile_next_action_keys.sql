CREATE OR REPLACE FUNCTION public.guard_client_profile() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE k text;n text;
BEGIN
IF jsonb_typeof(NEW.profile) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_CLIENT_PROFILE';END IF;
FOR k IN SELECT jsonb_object_keys(NEW.profile) LOOP
IF k NOT IN('legal_name','registration_number','jurisdiction','registered_address','correspondence_address','website','vat_number','division','regions','sectors','client_type','accounting_contact_id','relationship_owner','relationship_status','next_action','next_action_due','next_action_owner','next_action_done') OR jsonb_typeof(NEW.profile->k) <> 'string' OR length(NEW.profile->>k)>4000 THEN RAISE EXCEPTION 'INVALID_CLIENT_PROFILE';END IF;
END LOOP;
IF coalesce(NEW.profile->>'relationship_status','prospect') NOT IN('prospect','active','dormant','closed') THEN RAISE EXCEPTION 'INVALID_RELATIONSHIP_STATUS';END IF;
IF coalesce(NEW.profile->>'next_action_done','') NOT IN('','done') THEN RAISE EXCEPTION 'INVALID_CLIENT_PROFILE';END IF;
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