ALTER TABLE "agent_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "application" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cover_letter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cover_letter_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "web_access_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_content_report" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "owner_access" ON "agent_actions" AS PERMISSIVE FOR ALL TO public USING ("agent_actions"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("agent_actions"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "agent_attachments" AS PERMISSIVE FOR ALL TO public USING ("agent_attachments"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("agent_attachments"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "agent_messages" AS PERMISSIVE FOR ALL TO public USING ("agent_messages"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("agent_messages"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "agent_threads" AS PERMISSIVE FOR ALL TO public USING ("agent_threads"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("agent_threads"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "ai_providers" AS PERMISSIVE FOR ALL TO public USING ("ai_providers"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("ai_providers"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "application" AS PERMISSIVE FOR ALL TO public USING ("application"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("application"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "cover_letter" AS PERMISSIVE FOR ALL TO public USING ("cover_letter"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("cover_letter"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "cover_letter_version" AS PERMISSIVE FOR ALL TO public USING ("cover_letter_version"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("cover_letter_version"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "web_access_credentials" AS PERMISSIVE FOR ALL TO public USING ("web_access_credentials"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("web_access_credentials"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "ai_content_report" AS PERMISSIVE FOR ALL TO public USING ("ai_content_report"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("ai_content_report"."user_id" = NULLIF(current_setting('app.user_id', true), ''));
--> statement-breakpoint
ALTER TABLE "career_artifact" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "career_fact" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "career_fact_revision" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "career_job" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "career_notification" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "career_opportunity" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "career_profile" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "career_schedule" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "career_story" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "career_transcript" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "career_workspace" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "resume" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "resume_fact_link" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "resume_slug_redirect" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "resume_statistics" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "resume_statistics_daily" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "resume_version" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "agent_actions" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "agent_attachments" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "agent_messages" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "agent_threads" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "ai_providers" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "application" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "cover_letter" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "cover_letter_version" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "web_access_credentials" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "ai_content_report" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- These checks supplement RLS: a permitted child must not point at a different owner's parent.
CREATE FUNCTION enforce_owner_reference() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE parent_owner text; reference_id text;
BEGIN
  reference_id := to_jsonb(NEW)->>TG_ARGV[3];
  IF TG_OP='UPDATE' AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
    AND reference_id IS NOT DISTINCT FROM (to_jsonb(OLD)->>TG_ARGV[3]) THEN RETURN NEW; END IF;
  IF reference_id IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT user_id FROM %I.%I WHERE %I = $1', TG_ARGV[0], TG_ARGV[1], TG_ARGV[2])
    INTO parent_owner USING reference_id;
  IF parent_owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Referenced record is unavailable to this owner' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE link record; invalid boolean;
BEGIN
  FOR link IN
    SELECT fk.oid, child.relname AS child_table, parent.relname AS parent_table,
      ns.nspname AS schema_name, ca.attname AS child_column, pa.attname AS parent_column
    FROM pg_constraint fk
    JOIN pg_class child ON child.oid=fk.conrelid
    JOIN pg_class parent ON parent.oid=fk.confrelid
    JOIN pg_namespace ns ON ns.oid=child.relnamespace
    JOIN pg_attribute ca ON ca.attrelid=child.oid AND ca.attnum=fk.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid=parent.oid AND pa.attnum=fk.confkey[1]
    WHERE fk.contype='f' AND array_length(fk.conkey,1)=1 AND ns.nspname=current_schema()
      AND child.relrowsecurity AND parent.relrowsecurity
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=child.oid AND attname='user_id' AND NOT attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=parent.oid AND attname='user_id' AND NOT attisdropped)
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I c JOIN %I.%I p ON c.%I=p.%I WHERE c.user_id IS DISTINCT FROM p.user_id)',
      link.schema_name,link.child_table,link.schema_name,link.parent_table,link.child_column,link.parent_column) INTO invalid;
    IF invalid THEN RAISE EXCEPTION 'Existing foreign-owner reference requires review: %',link.child_table; END IF;
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION %I.enforce_owner_reference(%L,%L,%L,%L)',
      'owner_fk_'||link.oid,link.schema_name,link.child_table,link.schema_name,
      link.schema_name,link.parent_table,link.parent_column,link.child_column);
  END LOOP;
END;
$$;
--> statement-breakpoint
-- Discovery exposes owner identifiers only. Payload reads and mutations still require owner scope.
DO $migration$
DECLARE namespace text := current_schema();
BEGIN
  EXECUTE format($ddl$
    CREATE FUNCTION %I.master_cv_queue_owners() RETURNS TABLE(user_id text)
    LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $body$
      SELECT DISTINCT queue.user_id FROM (
        SELECT s.user_id FROM %I.career_schedule s WHERE s.enabled AND s.next_run_at <= now() AND (s.last_queued_at IS NULL OR s.next_run_at > s.last_queued_at)
        UNION SELECT j.user_id FROM %I.career_job j WHERE j.status IN ('queued','running')
        UNION SELECT n.user_id FROM %I.career_notification n
        JOIN %I.career_job j ON j.id=n.key AND j.user_id=n.user_id
        JOIN %I.career_schedule s ON s.id=j.schedule_id AND s.user_id=j.user_id
        WHERE j.status='completed' AND s.email AND s.enabled AND n.emailed_at IS NULL
        AND (n.email_attempted_at IS NULL OR n.email_attempted_at <= now() - interval '10 minutes')
        AND NOT EXISTS(SELECT 1 FROM %I.career_notification failed WHERE failed.user_id=n.user_id AND failed.key='email-failed:' || n.key)
      ) queue ORDER BY queue.user_id LIMIT 100
    $body$
  $ddl$, namespace, namespace, namespace, namespace, namespace, namespace, namespace);
  EXECUTE format('REVOKE ALL ON FUNCTION %I.master_cv_queue_owners() FROM PUBLIC', namespace);
  EXECUTE format($ddl$
    CREATE FUNCTION %I.master_cv_stale_agent_owners() RETURNS TABLE(user_id text)
    LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $body$
      SELECT DISTINCT a.user_id FROM %I.agent_threads a WHERE a.active_run_id IS NOT NULL
      AND (a.active_run_started_at IS NULL OR a.active_run_started_at < now() - interval '15 minutes')
    $body$
  $ddl$, namespace, namespace);
  EXECUTE format('REVOKE ALL ON FUNCTION %I.master_cv_stale_agent_owners() FROM PUBLIC', namespace);
END;
$migration$;
