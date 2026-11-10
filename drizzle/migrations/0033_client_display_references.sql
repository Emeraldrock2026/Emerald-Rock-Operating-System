ALTER TABLE public.clients ADD COLUMN display_reference text;

UPDATE public.clients c
SET display_reference = 'CLI-' || lpad(s.rn::text, 4, '0')
FROM (
  SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id) AS rn
  FROM public.clients
) s
WHERE c.id = s.id;

ALTER TABLE public.clients ALTER COLUMN display_reference SET NOT NULL;
CREATE UNIQUE INDEX clients_display_reference_tenant_key ON public.clients (tenant_id, display_reference);

CREATE OR REPLACE FUNCTION public.allocate_client_display_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE next_no integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text, 77));
  SELECT coalesce(max(substring(display_reference from 5)::integer), 0) + 1
    INTO next_no
    FROM public.clients
   WHERE tenant_id = NEW.tenant_id;
  NEW.display_reference := 'CLI-' || lpad(next_no::text, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER clients_display_reference_allocate
BEFORE INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.allocate_client_display_reference();

CREATE OR REPLACE FUNCTION public.guard_client_display_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.display_reference IS DISTINCT FROM OLD.display_reference THEN
    RAISE EXCEPTION 'IMMUTABLE_DISPLAY_REFERENCE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER clients_display_reference_guard
BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.guard_client_display_reference();