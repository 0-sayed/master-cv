DO $migration$ DECLARE namespace text := current_schema(); BEGIN
  EXECUTE format('ALTER TABLE %I.ai_platform_budget DROP CONSTRAINT ai_budget_finite', namespace);
  EXECUTE format(
    'ALTER TABLE %I.ai_platform_budget ADD CONSTRAINT ai_budget_finite CHECK (cap_micros > 0 AND request_cap_micros > 0 AND request_cap_micros <= cap_micros AND concurrency BETWEEN 1 AND 100 AND active >= 0 AND reserved_micros >= 0 AND spent_micros >= 0)',
    namespace
  );
  EXECUTE format($ddl$
CREATE OR REPLACE FUNCTION %1$I.master_cv_ai_admit_budget(operation_id text, request_limit bigint, day_limit bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE o %1$I.ai_operation; b %1$I.ai_platform_budget;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('master_cv_ai_budget',0));
  SELECT * INTO o FROM %1$I.ai_operation WHERE id=operation_id AND user_id=NULLIF(current_setting('app.user_id',true),'') FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF o.budget_id IS NOT NULL THEN RETURN NOT o.budget_closed; END IF;
  SELECT * INTO b FROM %1$I.ai_platform_budget
    WHERE route_id=o.route->>'routeId' AND route_revision=o.route->>'routeRevision'
      AND window_date=(now() AT TIME ZONE 'UTC')::date FOR UPDATE;
  IF NOT FOUND OR request_limit IS NULL OR day_limit IS NULL OR request_limit<=0 OR day_limit<=0 OR b.request_cap_micros<>request_limit OR b.cap_micros>day_limit OR (SELECT count(*) FROM %1$I.ai_operation live JOIN %1$I.ai_platform_budget policy ON policy.id=live.budget_id WHERE NOT live.budget_closed AND live.state IN ('queued','running','cancel_requested') AND policy.window_date=(now() AT TIME ZONE 'UTC')::date AND policy.id=b.id)>=b.concurrency OR (SELECT count(*) FROM %1$I.ai_operation live JOIN %1$I.ai_platform_budget policy ON policy.id=live.budget_id WHERE NOT live.budget_closed AND live.state IN ('queued','running','cancel_requested') AND policy.window_date=(now() AT TIME ZONE 'UTC')::date)>=b.concurrency OR b.spent_micros+b.reserved_micros+b.request_cap_micros>b.cap_micros THEN RETURN false; END IF;
  UPDATE %1$I.ai_platform_budget SET active=active+1,reserved_micros=reserved_micros+b.request_cap_micros WHERE id=b.id;
  UPDATE %1$I.ai_operation SET budget_id=b.id,reserved_micros=b.request_cap_micros WHERE id=o.id;
  RETURN true;
END $fn$;
$ddl$, namespace);
  EXECUTE format('REVOKE ALL ON FUNCTION %I.master_cv_ai_admit_budget(text,bigint,bigint) FROM PUBLIC', namespace);
END $migration$;
--> statement-breakpoint
DO $$ DECLARE namespace text := current_schema(); r record; BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE NOT rolsuper AND NOT rolbypassrls
    AND has_table_privilege(oid,format('%I.career_fact_revision',current_schema()),'INSERT')
    AND NOT has_table_privilege(oid,format('%I.career_fact_revision',current_schema()),'UPDATE')
    AND NOT pg_has_role(oid,(SELECT relowner FROM pg_class WHERE oid=to_regclass(format('%I.career_fact_revision',current_schema()))),'MEMBER')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.master_cv_ai_admit_budget(text,bigint,bigint) TO %I',namespace,r.rolname);
  END LOOP;
END $$;
