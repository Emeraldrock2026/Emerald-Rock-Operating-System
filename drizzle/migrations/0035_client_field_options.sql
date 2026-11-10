CREATE TABLE public.client_field_options(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  field text NOT NULL CHECK (field IN ('regions','sectors','client_type')),
  value text NOT NULL CHECK (length(btrim(value)) BETWEEN 1 AND 120),
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  version integer NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, field, value)
);
GRANT SELECT, INSERT, UPDATE ON public.client_field_options TO authenticated;
GRANT ALL ON public.client_field_options TO service_role;
ALTER TABLE public.client_field_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_field_options_read ON public.client_field_options FOR SELECT TO authenticated
  USING (public.is_active_member(tenant_id) AND public.module_enabled(tenant_id,'clients_projects'));
CREATE POLICY client_field_options_write ON public.client_field_options FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_manager(tenant_id) AND public.module_enabled(tenant_id,'clients_projects'));
CREATE POLICY client_field_options_update ON public.client_field_options FOR UPDATE TO authenticated
  USING (public.is_tenant_manager(tenant_id) AND public.module_enabled(tenant_id,'clients_projects'))
  WITH CHECK (public.is_tenant_manager(tenant_id) AND public.module_enabled(tenant_id,'clients_projects'));

CREATE TRIGGER client_field_options_insert BEFORE INSERT ON public.client_field_options FOR EACH ROW EXECUTE FUNCTION public.stamp_insert();
CREATE TRIGGER client_field_options_update BEFORE UPDATE ON public.client_field_options FOR EACH ROW EXECUTE FUNCTION public.stamp_update();

INSERT INTO public.client_field_options (tenant_id, field, value, position)
SELECT t.id, f.field, f.value, f.position
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('regions','London',10),('regions','South East',20),('regions','South West',30),('regions','East of England',40),('regions','East Midlands',50),('regions','West Midlands',60),('regions','Yorkshire and the Humber',70),('regions','North West',80),('regions','North East',90),('regions','Wales',100),('regions','Scotland',110),('regions','Northern Ireland',120),('regions','National',130),
    ('sectors','Commercial offices',10),('sectors','Residential',20),('sectors','Education',30),('sectors','Healthcare',40),('sectors','Industrial & logistics',50),('sectors','Retail',60),('sectors','Infrastructure',70),('sectors','Energy',80),('sectors','Defence',90),('sectors','Leisure & hospitality',100),('sectors','Public sector',110),('sectors','Mixed use',120),
    ('client_type','Main contractor',10),('client_type','Developer',20),('client_type','Public body',30),('client_type','Housing association',40),('client_type','Subcontractor',50),('client_type','Consultant',60),('client_type','Private client',70),('client_type','Framework',80)
) AS f(field, value, position);