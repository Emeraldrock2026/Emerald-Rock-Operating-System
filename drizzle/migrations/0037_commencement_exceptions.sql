ALTER TABLE public.appointment_commercials ADD COLUMN commencement_exception jsonb;

CREATE OR REPLACE FUNCTION public.guard_commencement_exception()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.commencement_exception IS NOT NULL THEN
    IF jsonb_typeof(NEW.commencement_exception) IS DISTINCT FROM 'object'
      OR coalesce(btrim(NEW.commencement_exception->>'authorised_by'), '') = ''
      OR coalesce(btrim(NEW.commencement_exception->>'reason'), '') = ''
      OR coalesce(btrim(NEW.commencement_exception->>'follow_up_on'), '') = '' THEN
      RAISE EXCEPTION 'INCOMPLETE_COMMENCEMENT_EXCEPTION';
    END IF;
    PERFORM (NEW.commencement_exception->>'follow_up_on')::date;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER appointment_commercials_exception_guard
BEFORE INSERT OR UPDATE ON public.appointment_commercials
FOR EACH ROW EXECUTE FUNCTION public.guard_commencement_exception();