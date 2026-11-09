-- Advance the first owner each tick, including when a previous owner consumed the whole job/mail budget.
-- The durable sequence also works across worker restarts and concurrent/serverless invocations.
DO $migration$
DECLARE namespace text := current_schema();
BEGIN
  EXECUTE format('CREATE SEQUENCE %I.master_cv_queue_rotation', namespace);
  EXECUTE format('REVOKE ALL ON SEQUENCE %I.master_cv_queue_rotation FROM PUBLIC', namespace);
  EXECUTE format($ddl$
    CREATE OR REPLACE FUNCTION %I.master_cv_queue_owners() RETURNS TABLE(user_id text)
    LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $body$
      WITH queue AS MATERIALIZED (
        SELECT s.user_id FROM %I.career_schedule s WHERE s.enabled AND s.next_run_at <= now() AND (s.last_queued_at IS NULL OR s.next_run_at > s.last_queued_at)
        UNION SELECT j.user_id FROM %I.career_job j WHERE j.status IN ('queued','running')
        UNION SELECT n.user_id FROM %I.career_notification n
        JOIN %I.career_job j ON j.id=n.key AND j.user_id=n.user_id
        JOIN %I.career_schedule s ON s.id=j.schedule_id AND s.user_id=j.user_id
        WHERE j.status='completed' AND s.email AND s.enabled AND n.emailed_at IS NULL
        AND (n.email_attempted_at IS NULL OR n.email_attempted_at <= now() - interval '10 minutes')
        AND NOT EXISTS(SELECT 1 FROM %I.career_notification failed WHERE failed.user_id=n.user_id AND failed.key='email-failed:' || n.key)
      ), rotation AS (
        SELECT nextval(%L::regclass) - 1 AS tick
      ), ordered AS (
        SELECT queue.user_id, row_number() OVER (ORDER BY queue.user_id) - 1 AS position,
          count(*) OVER () AS total FROM queue
      )
      SELECT ordered.user_id FROM ordered CROSS JOIN rotation
      ORDER BY mod(ordered.position - mod(rotation.tick, ordered.total) + ordered.total, ordered.total)
      LIMIT 100
    $body$
  $ddl$, namespace, namespace, namespace, namespace, namespace, namespace, namespace,
    format('%I.master_cv_queue_rotation', namespace));
  -- CREATE OR REPLACE preserves the existing restricted EXECUTE grant; never expose payload rows.
  EXECUTE format('REVOKE ALL ON FUNCTION %I.master_cv_queue_owners() FROM PUBLIC', namespace);
END;
$migration$;
