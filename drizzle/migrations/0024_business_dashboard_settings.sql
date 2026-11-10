CREATE TABLE public.tenant_dashboard_settings (
 tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id),
 config jsonb NOT NULL DEFAULT '{"widgets":["health","live","milestones","commercial","summary","details"],"statusMappings":{},"weights":{"actions":30,"milestones":30,"qa":20,"commercial":20},"freshness":{"milestones":28,"commercial":28}}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid,
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid, version integer NOT NULL DEFAULT 1
);
GRANT SELECT, INSERT, UPDATE ON public.tenant_dashboard_settings TO authenticated;
GRANT ALL ON public.tenant_dashboard_settings TO service_role;
ALTER TABLE public.tenant_dashboard_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY dashboard_settings_read ON public.tenant_dashboard_settings FOR SELECT TO authenticated USING (public.is_active_member(tenant_id) AND public.module_enabled(tenant_id,'clients_projects'));
CREATE POLICY dashboard_settings_insert ON public.tenant_dashboard_settings FOR INSERT TO authenticated WITH CHECK (public.is_tenant_admin(tenant_id) AND public.module_enabled(tenant_id,'clients_projects'));
CREATE POLICY dashboard_settings_update ON public.tenant_dashboard_settings FOR UPDATE TO authenticated USING (public.is_tenant_admin(tenant_id) AND public.module_enabled(tenant_id,'clients_projects')) WITH CHECK (public.is_tenant_admin(tenant_id) AND public.module_enabled(tenant_id,'clients_projects'));
CREATE FUNCTION public.guard_dashboard_settings() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE k text; v jsonb; s text; n numeric;
BEGIN
 IF jsonb_typeof(NEW.config) IS DISTINCT FROM 'object' OR NOT (NEW.config ?& ARRAY['widgets','statusMappings','weights','freshness']) OR (SELECT count(*) FROM jsonb_object_keys(NEW.config)) <> 4 THEN RAISE EXCEPTION 'INVALID_DASHBOARD_SETTINGS'; END IF;
 IF jsonb_typeof(NEW.config->'widgets') IS DISTINCT FROM 'array' OR jsonb_typeof(NEW.config->'statusMappings') IS DISTINCT FROM 'object' OR jsonb_typeof(NEW.config->'weights') IS DISTINCT FROM 'object' OR jsonb_typeof(NEW.config->'freshness') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_DASHBOARD_SETTINGS'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(NEW.config->'widgets') w WHERE w NOT IN ('health','live','milestones','commercial','summary','details')) OR (SELECT count(*) FROM jsonb_array_elements_text(NEW.config->'widgets')) <> (SELECT count(DISTINCT w) FROM jsonb_array_elements_text(NEW.config->'widgets') w) THEN RAISE EXCEPTION 'INVALID_DASHBOARD_WIDGETS'; END IF;
 IF NOT (NEW.config->'weights' ?& ARRAY['actions','milestones','qa','commercial']) OR (SELECT count(*) FROM jsonb_object_keys(NEW.config->'weights')) <> 4 THEN RAISE EXCEPTION 'INVALID_HEALTH_WEIGHTS'; END IF;
 n := 0;
 FOR k,v IN SELECT * FROM jsonb_each(NEW.config->'weights') LOOP
  IF jsonb_typeof(v) <> 'number' OR (v::text)::numeric < 0 OR (v::text)::numeric > 100 OR (v::text)::numeric <> trunc((v::text)::numeric) THEN RAISE EXCEPTION 'INVALID_HEALTH_WEIGHTS'; END IF;
  n := n + (v::text)::numeric;
 END LOOP;
 IF n <= 0 THEN RAISE EXCEPTION 'INVALID_HEALTH_WEIGHTS'; END IF;
 IF NOT (NEW.config->'freshness' ?& ARRAY['milestones','commercial']) OR (SELECT count(*) FROM jsonb_object_keys(NEW.config->'freshness')) <> 2 THEN RAISE EXCEPTION 'INVALID_FRESHNESS'; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(NEW.config->'freshness') LOOP
  IF jsonb_typeof(v) <> 'number' OR (v::text)::numeric < 1 OR (v::text)::numeric > 365 OR (v::text)::numeric <> trunc((v::text)::numeric) THEN RAISE EXCEPTION 'INVALID_FRESHNESS'; END IF;
 END LOOP;
 FOR k,v IN SELECT * FROM jsonb_each(NEW.config->'statusMappings') LOOP
  IF k NOT IN ('progress_reports','delay_reports','rfis','early_warnings','programmes','qa','handover','rams','deliveries','procurement','assets_plant','change_control') OR jsonb_typeof(v) <> 'object' THEN RAISE EXCEPTION 'INVALID_STATUS_MAPPING'; END IF;
  FOR s IN SELECT jsonb_object_keys(v) LOOP
   IF length(s) NOT BETWEEN 1 AND 80 OR v->>s NOT IN ('red','amber','green','neutral') OR jsonb_typeof(v->s) <> 'string' THEN RAISE EXCEPTION 'INVALID_STATUS_MAPPING'; END IF;
  END LOOP;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER dashboard_settings_guard BEFORE INSERT OR UPDATE ON public.tenant_dashboard_settings FOR EACH ROW EXECUTE FUNCTION public.guard_dashboard_settings();
CREATE TRIGGER dashboard_settings_insert_stamp BEFORE INSERT ON public.tenant_dashboard_settings FOR EACH ROW EXECUTE FUNCTION public.stamp_insert();
CREATE TRIGGER dashboard_settings_update_stamp BEFORE UPDATE ON public.tenant_dashboard_settings FOR EACH ROW EXECUTE FUNCTION public.stamp_update();
CREATE TRIGGER dashboard_settings_audit AFTER INSERT OR UPDATE ON public.tenant_dashboard_settings FOR EACH ROW EXECUTE FUNCTION public.write_audit('tenant');
ALTER TABLE public.project_health_settings ADD COLUMN inherit_business_weights boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.project_health_settings.inherit_business_weights IS 'True uses current business dashboard defaults; false preserves the explicit project weight override.';