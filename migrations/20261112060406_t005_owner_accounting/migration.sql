-- Scope forced-RLS accounting to the owner being deleted, then restore the caller context.
DO $migration$ DECLARE namespace text := current_schema(); BEGIN
  EXECUTE format($ddl$
CREATE OR REPLACE FUNCTION %1$I.master_cv_ai_delete_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE o %1$I.ai_operation; measured bigint; previous_owner text := current_setting('app.user_id',true);
BEGIN
  IF TG_TABLE_SCHEMA <> %2$L OR TG_TABLE_NAME <> 'user' OR TG_OP <> 'DELETE' THEN RAISE EXCEPTION 'Invalid AI cleanup trigger'; END IF;
  PERFORM set_config('app.user_id',OLD.id,true);
  -- User deletion already holds the owner row lock; keep owner -> budget -> operation order.
  PERFORM pg_advisory_xact_lock(hashtextextended('master_cv_ai_budget',0));
  FOR o IN SELECT * FROM %1$I.ai_operation WHERE user_id=OLD.id AND budget_id IS NOT NULL FOR UPDATE LOOP
    IF o.budget_closed AND o.reserved_micros=0 THEN CONTINUE; END IF;
    SELECT CASE WHEN bool_and(finished_at IS NOT NULL AND cost_micros IS NOT NULL)
      THEN sum(cost_micros) WHEN count(*)=0 THEN 0 ELSE NULL END INTO measured
      FROM %1$I.ai_operation_attempt a WHERE a.operation_id=o.id;
    -- Deletion erases attempts: conservatively book unknown liability instead of orphaning reservations.
    UPDATE %1$I.ai_platform_budget SET active=active-CASE WHEN o.budget_closed THEN 0 ELSE 1 END,
      reserved_micros=reserved_micros-o.reserved_micros,
      spent_micros=spent_micros+COALESCE(measured,o.reserved_micros) WHERE id=o.budget_id;
  END LOOP;
  PERFORM set_config('app.user_id',COALESCE(previous_owner,''),true);
  RETURN OLD;
END $fn$;
$ddl$, namespace, namespace);
END $migration$;
