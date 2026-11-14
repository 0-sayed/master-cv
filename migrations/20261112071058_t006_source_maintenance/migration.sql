CREATE POLICY "discovery_owner_read" ON "ai_import_review_source" AS PERMISSIVE FOR SELECT TO current_user USING (true);--> statement-breakpoint
-- Reuse the existing scheduler's metadata-only discovery for expired, unused staged sources too.
DO $migration$ DECLARE namespace text := current_schema(); BEGIN
  EXECUTE format($ddl$
CREATE OR REPLACE FUNCTION %1$I.master_cv_ai_queue_owners() RETURNS TABLE(user_id text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
  SELECT owners.user_id FROM (
    SELECT o.user_id FROM %1$I.ai_operation o WHERE o.state IN ('queued','running','cancel_requested') OR (o.budget_closed AND o.reserved_micros>0 AND o.deadline_at + interval '5 minutes' <= now())
    UNION
    SELECT s.user_id FROM %1$I.ai_import_review_source s WHERE s.expires_at <= now()
  ) owners ORDER BY owners.user_id LIMIT 100
$fn$;
$ddl$, namespace);
END $migration$;
