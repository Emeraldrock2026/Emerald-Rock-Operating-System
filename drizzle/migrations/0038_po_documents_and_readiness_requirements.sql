ALTER TABLE public.appointment_commercials ADD COLUMN po_file_id uuid, ADD COLUMN po_file_version integer;
ALTER TABLE public.appointment_commercials ADD CONSTRAINT appointment_commercials_po_file_fk FOREIGN KEY (tenant_id, po_file_id) REFERENCES public.project_files(tenant_id, id);
ALTER TABLE public.appointment_commercials ADD CONSTRAINT appointment_commercials_po_pair CHECK ((po_file_id IS NULL) = (po_file_version IS NULL));

CREATE FUNCTION public.guard_po_document() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.po_file_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_appointments a
    JOIN public.project_files f ON f.id = NEW.po_file_id AND f.tenant_id = a.tenant_id AND f.project_id = a.project_id
    JOIN public.project_file_versions v ON v.file_id = f.id AND v.version_no = NEW.po_file_version
    WHERE a.id = NEW.appointment_id AND coalesce(public.project_module_active(f.tenant_id, f.project_id, f.module_id), false)
  ) THEN RAISE EXCEPTION 'INVALID_PO_DOCUMENT'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER appointment_commercials_po_document_guard BEFORE INSERT OR UPDATE ON public.appointment_commercials FOR EACH ROW EXECUTE FUNCTION public.guard_po_document();

CREATE TABLE public.tenant_readiness_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  version integer NOT NULL DEFAULT 1
);
GRANT SELECT, INSERT, UPDATE ON public.tenant_readiness_settings TO authenticated;
GRANT ALL ON public.tenant_readiness_settings TO service_role;
ALTER TABLE public.tenant_readiness_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY readiness_settings_read ON public.tenant_readiness_settings FOR SELECT TO authenticated USING (coalesce(public.is_active_member(tenant_id), false));
CREATE POLICY readiness_settings_insert ON public.tenant_readiness_settings FOR INSERT TO authenticated WITH CHECK (coalesce(public.is_tenant_admin(tenant_id), false));
CREATE POLICY readiness_settings_update ON public.tenant_readiness_settings FOR UPDATE TO authenticated USING (coalesce(public.is_tenant_admin(tenant_id), false)) WITH CHECK (coalesce(public.is_tenant_admin(tenant_id), false));

CREATE FUNCTION public.guard_readiness_settings() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE k text;
BEGIN
  IF jsonb_typeof(NEW.config) <> 'object' THEN RAISE EXCEPTION 'INVALID_READINESS_SETTINGS'; END IF;
  FOR k IN SELECT jsonb_object_keys(NEW.config) LOOP
    IF k NOT IN ('proposal_scope','commence_executed','commence_po','commence_po_document','commence_stages','invoice_route','invoice_payment_terms','invoice_recipients')
       OR jsonb_typeof(NEW.config->k) <> 'boolean' THEN RAISE EXCEPTION 'INVALID_READINESS_SETTINGS'; END IF;
  END LOOP;
  IF TG_OP = 'UPDATE' AND NEW.tenant_id <> OLD.tenant_id THEN RAISE EXCEPTION 'INVALID_READINESS_SETTINGS'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER readiness_settings_guard BEFORE INSERT OR UPDATE ON public.tenant_readiness_settings FOR EACH ROW EXECUTE FUNCTION public.guard_readiness_settings();
CREATE TRIGGER readiness_settings_insert_stamp BEFORE INSERT ON public.tenant_readiness_settings FOR EACH ROW EXECUTE FUNCTION public.stamp_insert();
CREATE TRIGGER readiness_settings_update_stamp BEFORE UPDATE ON public.tenant_readiness_settings FOR EACH ROW EXECUTE FUNCTION public.stamp_update();
CREATE TRIGGER readiness_settings_audit AFTER INSERT OR UPDATE ON public.tenant_readiness_settings FOR EACH ROW EXECUTE FUNCTION public.write_audit('client');