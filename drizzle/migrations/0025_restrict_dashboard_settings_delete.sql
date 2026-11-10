REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.tenant_dashboard_settings FROM authenticated;
REVOKE ALL ON public.tenant_dashboard_settings FROM anon;
REVOKE ALL ON public.tenant_dashboard_settings FROM PUBLIC;