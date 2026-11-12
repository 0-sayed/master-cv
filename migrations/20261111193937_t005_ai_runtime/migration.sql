CREATE TABLE "ai_operation" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"request_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"kind" text NOT NULL,
	"sources" jsonb NOT NULL,
	"route" jsonb NOT NULL,
	"consent_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"parameters" jsonb DEFAULT '{}' NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone DEFAULT now() + interval '120 seconds' NOT NULL,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"result" jsonb,
	"failure_code" text,
	"copy_claim" jsonb,
	"budget_id" text,
	"reserved_micros" bigint DEFAULT 0 NOT NULL,
	"actual_micros" bigint,
	"budget_closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_operation_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "ai_operation_user_id_request_key_unique" UNIQUE("user_id","request_key"),
	CONSTRAINT "ai_operation_state_valid" CHECK ("state" IN ('queued','running','waiting_review','succeeded','failed','cancel_requested','cancelled')),
	CONSTRAINT "ai_operation_delivery_valid" CHECK (("state" IN ('waiting_review','succeeded')) = ("delivered_at" IS NOT NULL AND "result" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "ai_operation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_operation_attempt" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"step_id" text NOT NULL,
	"lease_token" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" text DEFAULT 'unknown' NOT NULL,
	"response_id" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cached_tokens" integer,
	"cost_micros" bigint,
	"output" jsonb,
	CONSTRAINT "ai_operation_attempt_operation_id_ordinal_unique" UNIQUE("operation_id","ordinal"),
	CONSTRAINT "ai_attempt_ordinal" CHECK ("ordinal" BETWEEN 1 AND 3),
	CONSTRAINT "ai_attempt_cost" CHECK ("cost_micros" IS NULL OR "cost_micros" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ai_operation_attempt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_platform_budget" (
	"id" text PRIMARY KEY,
	"route_id" text NOT NULL,
	"route_revision" text NOT NULL,
	"window_date" date NOT NULL,
	"cap_micros" bigint NOT NULL,
	"request_cap_micros" bigint NOT NULL,
	"reserved_micros" bigint DEFAULT 0 NOT NULL,
	"spent_micros" bigint DEFAULT 0 NOT NULL,
	"active" integer DEFAULT 0 NOT NULL,
	"concurrency" integer NOT NULL,
	CONSTRAINT "ai_platform_budget_route_id_route_revision_window_date_unique" UNIQUE("route_id","route_revision","window_date"),
	CONSTRAINT "ai_budget_finite" CHECK ("cap_micros" > 0 AND "request_cap_micros" > 0 AND "request_cap_micros" <= "cap_micros" AND "concurrency" BETWEEN 1 AND 2 AND "active" >= 0 AND "reserved_micros" >= 0 AND "spent_micros" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ai_platform_budget" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_processing_consent" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"route_id" text NOT NULL,
	"route_revision" text NOT NULL,
	"notice_version" text NOT NULL,
	"purpose" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "ai_processing_consent_user_id_route_id_route_revision_notice_version_purpose_unique" UNIQUE("user_id","route_id","route_revision","notice_version","purpose")
);
--> statement-breakpoint
ALTER TABLE "ai_processing_consent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_usage_ledger" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"kind" text NOT NULL,
	"units" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_ledger_valid" CHECK ("units" = 1 AND "kind" IN ('reserve','settle','release'))
);
--> statement-breakpoint
ALTER TABLE "ai_usage_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_threads" ADD COLUMN "active_operation_id" text;--> statement-breakpoint
ALTER TABLE "agent_threads" ADD COLUMN "route_binding" jsonb;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD COLUMN "config_revision" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
CREATE INDEX "ai_operation_state_due_at_index" ON "ai_operation" ("state","due_at");--> statement-breakpoint
CREATE INDEX "ai_operation_user_id_state_index" ON "ai_operation" ("user_id","state");--> statement-breakpoint
CREATE INDEX "ai_usage_ledger_user_id_index" ON "ai_usage_ledger" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_ledger_reserve_once" ON "ai_usage_ledger" ("operation_id") WHERE "kind" = 'reserve';--> statement-breakpoint
CREATE UNIQUE INDEX "ai_ledger_terminal_once" ON "ai_usage_ledger" ("operation_id") WHERE "kind" IN ('settle','release');--> statement-breakpoint
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_VOod3rBKguu3_fkey" FOREIGN KEY ("user_id","active_operation_id") REFERENCES "ai_operation"("user_id","id");--> statement-breakpoint
ALTER TABLE "ai_operation" ADD CONSTRAINT "ai_operation_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_operation_attempt" ADD CONSTRAINT "ai_operation_attempt_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_operation_attempt" ADD CONSTRAINT "ai_operation_attempt_ZpUbHDxv8nNh_fkey" FOREIGN KEY ("user_id","operation_id") REFERENCES "ai_operation"("user_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_processing_consent" ADD CONSTRAINT "ai_processing_consent_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_usage_ledger" ADD CONSTRAINT "ai_usage_ledger_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_usage_ledger" ADD CONSTRAINT "ai_usage_ledger_NOMCmUIWlhiv_fkey" FOREIGN KEY ("user_id","operation_id") REFERENCES "ai_operation"("user_id","id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "owner_access" ON "ai_operation" AS PERMISSIVE FOR ALL TO public USING ("ai_operation"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("ai_operation"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "discovery_owner_read" ON "ai_operation" AS PERMISSIVE FOR SELECT TO current_user USING (true);--> statement-breakpoint
CREATE POLICY "owner_access" ON "ai_operation_attempt" AS PERMISSIVE FOR ALL TO public USING ("ai_operation_attempt"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("ai_operation_attempt"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "budget_owner" ON "ai_platform_budget" AS PERMISSIVE FOR ALL TO current_user USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "owner_access" ON "ai_processing_consent" AS PERMISSIVE FOR ALL TO public USING ("ai_processing_consent"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("ai_processing_consent"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "ai_usage_ledger" AS PERMISSIVE FOR ALL TO public USING ("ai_usage_ledger"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("ai_usage_ledger"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
ALTER TABLE ai_operation FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_operation_attempt FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_processing_consent FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_platform_budget FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $migration$ DECLARE namespace text := current_schema(); BEGIN
  EXECUTE format($ddl$
CREATE FUNCTION %1$I.master_cv_ai_queue_owners() RETURNS TABLE(user_id text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
  SELECT DISTINCT o.user_id FROM %1$I.ai_operation o
  WHERE o.state IN ('queued','running','cancel_requested') OR (o.budget_closed AND o.reserved_micros>0 AND o.deadline_at + interval '5 minutes' <= now()) ORDER BY o.user_id LIMIT 100
$fn$;
$ddl$, namespace);
  EXECUTE format('REVOKE ALL ON FUNCTION %I.master_cv_ai_queue_owners() FROM PUBLIC', namespace);
END $migration$;
--> statement-breakpoint
DO $migration$ DECLARE namespace text := current_schema(); BEGIN
  EXECUTE format($ddl$
CREATE FUNCTION %1$I.master_cv_ai_admit_budget(operation_id text, request_limit bigint, day_limit bigint) RETURNS boolean
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
  IF NOT FOUND OR request_limit IS NULL OR day_limit IS NULL OR request_limit<=0 OR day_limit<=0 OR b.request_cap_micros<>request_limit OR b.cap_micros>day_limit OR (SELECT count(*) FROM %1$I.ai_operation live JOIN %1$I.ai_platform_budget policy ON policy.id=live.budget_id WHERE NOT live.budget_closed AND live.state IN ('queued','running','cancel_requested') AND policy.window_date=(now() AT TIME ZONE 'UTC')::date AND policy.id=b.id)>=b.concurrency OR (SELECT count(*) FROM %1$I.ai_operation live JOIN %1$I.ai_platform_budget policy ON policy.id=live.budget_id WHERE NOT live.budget_closed AND live.state IN ('queued','running','cancel_requested') AND policy.window_date=(now() AT TIME ZONE 'UTC')::date)>=2 OR b.spent_micros+b.reserved_micros+b.request_cap_micros>b.cap_micros THEN RETURN false; END IF;
  UPDATE %1$I.ai_platform_budget SET active=active+1,reserved_micros=reserved_micros+b.request_cap_micros WHERE id=b.id;
  UPDATE %1$I.ai_operation SET budget_id=b.id,reserved_micros=b.request_cap_micros WHERE id=o.id;
  RETURN true;
END $fn$;
$ddl$, namespace);
  EXECUTE format('REVOKE ALL ON FUNCTION %I.master_cv_ai_admit_budget(text,bigint,bigint) FROM PUBLIC', namespace);
END $migration$;
--> statement-breakpoint
DO $migration$ DECLARE namespace text := current_schema(); BEGIN
  EXECUTE format($ddl$
CREATE FUNCTION %1$I.master_cv_ai_reconcile_budget(operation_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE o %1$I.ai_operation; b %1$I.ai_platform_budget; measured bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('master_cv_ai_budget',0));
  SELECT * INTO o FROM %1$I.ai_operation WHERE id=operation_id AND user_id=NULLIF(current_setting('app.user_id',true),'') FOR UPDATE;
  IF NOT FOUND OR o.budget_id IS NULL OR o.state NOT IN ('waiting_review','succeeded','failed','cancelled') THEN RETURN; END IF;
  SELECT CASE WHEN bool_and(finished_at IS NOT NULL AND cost_micros IS NOT NULL)
    THEN sum(cost_micros) WHEN count(*)=0 THEN 0 ELSE NULL END INTO measured
    FROM %1$I.ai_operation_attempt a WHERE a.operation_id=o.id;
  SELECT * INTO b FROM %1$I.ai_platform_budget WHERE id=o.budget_id FOR UPDATE;
  IF o.budget_closed AND o.reserved_micros=0 THEN
    -- A bounded unknown settlement booked the cap. Correct it once when late evidence arrives.
    IF o.actual_micros IS NULL AND measured IS NOT NULL THEN
      UPDATE %1$I.ai_platform_budget SET spent_micros=spent_micros-b.request_cap_micros+measured WHERE id=b.id;
      UPDATE %1$I.ai_operation SET actual_micros=measured WHERE id=o.id;
    END IF;
    RETURN;
  END IF;
  IF measured IS NULL AND o.deadline_at + interval '5 minutes' <= now() THEN
    -- Bounded recovery: release the reservation by booking its full liability, never assume free inference.
    UPDATE %1$I.ai_platform_budget SET active=active-CASE WHEN o.budget_closed THEN 0 ELSE 1 END,
      spent_micros=spent_micros+o.reserved_micros,reserved_micros=reserved_micros-o.reserved_micros WHERE id=b.id;
    UPDATE %1$I.ai_operation SET actual_micros=NULL,budget_closed=true,reserved_micros=0 WHERE id=o.id;
    RETURN;
  END IF;
  IF o.budget_closed AND measured IS NULL THEN RETURN; END IF;
  o.actual_micros := measured;
  -- Unknown expense retains its conservative reservation. Execution concurrency is released.
  UPDATE %1$I.ai_platform_budget SET active=active-CASE WHEN o.budget_closed THEN 0 ELSE 1 END,
    reserved_micros=reserved_micros-CASE WHEN o.actual_micros IS NULL THEN 0 ELSE o.reserved_micros END,
    spent_micros=spent_micros+COALESCE(o.actual_micros,0) WHERE id=o.budget_id;
  UPDATE %1$I.ai_operation SET actual_micros=measured,budget_closed=true,reserved_micros=CASE WHEN o.actual_micros IS NULL THEN o.reserved_micros ELSE 0 END WHERE id=o.id;
END $fn$;
$ddl$, namespace);
  EXECUTE format('REVOKE ALL ON FUNCTION %I.master_cv_ai_reconcile_budget(text) FROM PUBLIC', namespace);
END $migration$;
--> statement-breakpoint
CREATE FUNCTION master_cv_ai_operation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=TG_RELID)) THEN
    IF TG_OP='INSERT' THEN
      IF NEW.budget_id IS NOT NULL OR NEW.reserved_micros<>0 OR NEW.actual_micros IS NOT NULL OR NEW.budget_closed
        THEN RAISE EXCEPTION 'Protected AI accounting'; END IF;
    ELSIF (OLD.budget_id,OLD.reserved_micros,OLD.actual_micros,OLD.budget_closed)
      IS DISTINCT FROM (NEW.budget_id,NEW.reserved_micros,NEW.actual_micros,NEW.budget_closed)
      THEN RAISE EXCEPTION 'Protected AI accounting'; END IF;
  END IF;
  IF TG_OP='INSERT' THEN RETURN NEW; END IF;
  IF (OLD.id,OLD.created_at,OLD.user_id,OLD.request_key,OLD.fingerprint,OLD.kind,OLD.sources,OLD.route,OLD.consent_version,OLD.prompt_version,OLD.schema_version,OLD.parameters,OLD.copy_claim,OLD.deadline_at)
    IS DISTINCT FROM (NEW.id,NEW.created_at,NEW.user_id,NEW.request_key,NEW.fingerprint,NEW.kind,NEW.sources,NEW.route,NEW.consent_version,NEW.prompt_version,NEW.schema_version,NEW.parameters,NEW.copy_claim,NEW.deadline_at)
    THEN RAISE EXCEPTION 'Immutable AI operation binding'; END IF;
  IF OLD.delivered_at IS NOT NULL AND (OLD.result,OLD.delivered_at) IS DISTINCT FROM (NEW.result,NEW.delivered_at)
    THEN RAISE EXCEPTION 'Immutable AI result'; END IF;
  IF OLD.state<>NEW.state AND NOT (
    (OLD.state='queued' AND NEW.state IN ('running','failed','cancelled')) OR
    (OLD.state='running' AND NEW.state IN ('waiting_review','succeeded','failed','cancel_requested')) OR
    (OLD.state='cancel_requested' AND NEW.state IN ('cancelled','failed')) OR
    (OLD.state='waiting_review' AND NEW.state='succeeded')
  ) THEN RAISE EXCEPTION 'Invalid AI operation transition'; END IF;
  IF OLD.state='queued' AND NEW.state='running' THEN
    -- Freeze the execution allowance at creation, but exclude queue wait exactly once.
    NEW.deadline_at := clock_timestamp() + (OLD.deadline_at-OLD.created_at);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_operation_guard BEFORE INSERT OR UPDATE ON ai_operation FOR EACH ROW EXECUTE FUNCTION master_cv_ai_operation_guard();
--> statement-breakpoint
CREATE FUNCTION master_cv_ai_attempt_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.finished_at IS NOT NULL THEN RAISE EXCEPTION 'Immutable completed AI attempt'; END IF;
  IF (OLD.id,OLD.user_id,OLD.operation_id,OLD.ordinal,OLD.step_id,OLD.lease_token,OLD.started_at)
    IS DISTINCT FROM (NEW.id,NEW.user_id,NEW.operation_id,NEW.ordinal,NEW.step_id,NEW.lease_token,NEW.started_at)
    THEN RAISE EXCEPTION 'Immutable AI attempt identity'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_attempt_guard BEFORE UPDATE ON ai_operation_attempt FOR EACH ROW EXECUTE FUNCTION master_cv_ai_attempt_guard();
--> statement-breakpoint
-- Existing provisioned roles receive the new grants without rotating credentials or assuming ownership.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE NOT rolsuper AND NOT rolbypassrls
    AND has_table_privilege(oid,format('%I.career_fact_revision',current_schema()),'INSERT')
    AND NOT has_table_privilege(oid,format('%I.career_fact_revision',current_schema()),'UPDATE')
    AND NOT pg_has_role(oid,(SELECT relowner FROM pg_class WHERE oid=to_regclass(format('%I.career_fact_revision',current_schema()))),'MEMBER')
  LOOP
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON ai_operation,ai_operation_attempt,ai_processing_consent TO %I',r.rolname);
    EXECUTE format('REVOKE DELETE,TRUNCATE ON ai_operation,ai_operation_attempt FROM %I',r.rolname);
    EXECUTE format('GRANT SELECT,INSERT ON ai_usage_ledger TO %I',r.rolname);
    EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE ON ai_usage_ledger FROM %I',r.rolname);
    EXECUTE format('REVOKE ALL ON ai_platform_budget FROM %I',r.rolname);
    EXECUTE format('GRANT EXECUTE ON FUNCTION master_cv_ai_queue_owners(),master_cv_ai_admit_budget(text,bigint,bigint),master_cv_ai_reconcile_budget(text) TO %I',r.rolname);
  END LOOP;
END $$;

--> statement-breakpoint
DO $migration$ DECLARE namespace text := current_schema(); BEGIN
  EXECUTE format($ddl$
CREATE FUNCTION %1$I.master_cv_ai_delete_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE o %1$I.ai_operation; measured bigint;
BEGIN
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
  RETURN OLD;
END $fn$;
$ddl$, namespace);
END $migration$;
REVOKE ALL ON FUNCTION master_cv_ai_delete_owner() FROM PUBLIC;
CREATE TRIGGER ai_delete_owner BEFORE DELETE ON "user" FOR EACH ROW EXECUTE FUNCTION master_cv_ai_delete_owner();
