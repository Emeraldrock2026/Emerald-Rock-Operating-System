ALTER TABLE public.tenants
  ADD COLUMN accent_colour text NOT NULL DEFAULT '#0B2B22',
  ADD COLUMN logo_dark_path text,
  ADD COLUMN default_appearance text NOT NULL DEFAULT 'system';
ALTER TABLE public.tenants ADD CONSTRAINT tenants_accent_colour_hex CHECK (accent_colour ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE public.tenants ADD CONSTRAINT tenants_default_appearance_check CHECK (default_appearance IN ('light','dark','system'));
ALTER TABLE public.tenants ADD CONSTRAINT tenants_logo_paths_scoped CHECK (
  (logo_path IS NULL OR logo_path LIKE id::text || '/%') AND (logo_dark_path IS NULL OR logo_dark_path LIKE id::text || '/%')) NOT VALID;

CREATE TABLE public.user_preferences (
  user_id uuid PRIMARY KEY,
  appearance text NOT NULL CHECK (appearance IN ('light','dark','system')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own preferences" ON public.user_preferences FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users add their own preferences" ON public.user_preferences FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users change their own preferences" ON public.user_preferences FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users clear their own preferences" ON public.user_preferences FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Branding files live under <tenant_id>/... in the private tenant-branding bucket.
CREATE OR REPLACE FUNCTION public.branding_folder_tenant(_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
begin
  return split_part(_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;

CREATE POLICY "Members can view their business branding" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tenant-branding' AND (public.has_membership(public.branding_folder_tenant(name)) OR public.is_platform_admin()));
CREATE POLICY "Owner/Admins can upload branding" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tenant-branding' AND public.is_tenant_admin(public.branding_folder_tenant(name))
    AND lower(storage.extension(name)) IN ('png','jpg','jpeg','webp','svg'));
CREATE POLICY "Owner/Admins can replace branding" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'tenant-branding' AND public.is_tenant_admin(public.branding_folder_tenant(name)))
  WITH CHECK (bucket_id = 'tenant-branding' AND public.is_tenant_admin(public.branding_folder_tenant(name)));
CREATE POLICY "Owner/Admins can remove branding" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tenant-branding' AND public.is_tenant_admin(public.branding_folder_tenant(name)));