-- Better Auth verification values are either subject IDs or JSON ceremony data.
CREATE FUNCTION public.master_cv_verification_owner(value text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE parsed jsonb;
BEGIN
  BEGIN
    parsed := value::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN RETURN value;
  END;
  IF jsonb_typeof(parsed) <> 'object' THEN RETURN value; END IF;
  RETURN coalesce(nullif(parsed #>> '{userData,id}', ''), nullif(parsed ->> 'userId', ''));
END;
$$;
