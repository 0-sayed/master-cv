-- Account-scoped privileged operations preserve the application's append-only grants.
CREATE FUNCTION public.master_cv_quiesce_deleted_account(request_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE subject text; operation record; inflight boolean; measured bigint;
BEGIN
 SELECT subject_user_id INTO subject FROM public.account_deletion WHERE id=request_id
 AND subject_user_id=nullif(current_setting('app.user_id',true),'');
 IF subject IS NULL THEN RAISE EXCEPTION 'DELETION_REQUEST_UNAVAILABLE'; END IF;
 PERFORM 1 FROM public."user" WHERE id=subject AND data_deletion_requested_at IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NOT EXISTS(SELECT 1 FROM public."user" WHERE id=subject); END IF;
 UPDATE public.career_schedule SET enabled=false WHERE user_id=subject;
 UPDATE public.career_job SET status='canceled',lease=NULL,lease_until=NULL
 WHERE user_id=subject AND (status<>'running' OR lease_until<=now());
 UPDATE public.agent_actions SET status='rejected' WHERE user_id=subject AND status='pending';
 UPDATE public.ai_operation SET state='cancel_requested' WHERE user_id=subject AND state='running';
 SELECT EXISTS(SELECT 1 FROM public.ai_operation WHERE user_id=subject AND state='cancel_requested' AND lease_until>now())
 OR EXISTS(SELECT 1 FROM public.career_job WHERE user_id=subject AND status='running' AND lease_until>now())
 OR EXISTS(SELECT 1 FROM public.agent_threads WHERE user_id=subject AND active_run_id IS NOT NULL
 AND (active_run_started_at IS NULL OR active_run_started_at>now()-interval '15 minutes'))
 OR EXISTS(SELECT 1 FROM public.privacy_work WHERE user_id=subject AND kind<>'delete_account'
 AND ((status='running' AND lease_until>now()) OR payload->>'ioPending'='true')) INTO inflight;
 IF inflight THEN RETURN false; END IF;
 UPDATE public.agent_threads SET active_run_id=NULL,active_stream_id=NULL,active_run_started_at=NULL WHERE user_id=subject;
 UPDATE public.privacy_work SET status='cancelled',payload=NULL,lease_token=NULL,lease_until=NULL,completed_at=now()
 WHERE user_id=subject AND kind NOT IN ('delete_account','send_notice') AND status NOT IN ('complete','cancelled');
 UPDATE public.ai_operation SET state='cancelled',failure_code='ACCOUNT_DELETION_REQUESTED',lease_token=NULL,lease_until=NULL,
 result=NULL,delivered_at=NULL WHERE user_id=subject AND state IN ('queued','running','cancel_requested');
 PERFORM pg_advisory_xact_lock(hashtextextended('master_cv_ai_budget',0));
 FOR operation IN SELECT * FROM public.ai_operation WHERE user_id=subject FOR UPDATE LOOP
   -- Once no live worker can publish, unresolved inference is charged at its
   -- reserved bound before personal accounting rows are erased.
   IF operation.budget_id IS NOT NULL THEN
    IF operation.budget_closed AND operation.reserved_micros=0 THEN
     PERFORM public.master_cv_ai_reconcile_budget(operation.id);
    ELSE
     SELECT CASE WHEN bool_and(finished_at IS NOT NULL AND cost_micros IS NOT NULL)
      THEN sum(cost_micros) WHEN count(*)=0 THEN 0 ELSE NULL END INTO measured
      FROM public.ai_operation_attempt WHERE operation_id=operation.id;
     UPDATE public.ai_platform_budget SET active=active-CASE WHEN operation.budget_closed THEN 0 ELSE 1 END,
      spent_micros=spent_micros+coalesce(measured,operation.reserved_micros),
      reserved_micros=reserved_micros-operation.reserved_micros WHERE id=operation.budget_id;
     UPDATE public.ai_operation SET actual_micros=measured,budget_closed=true,reserved_micros=0 WHERE id=operation.id;
    END IF;
   END IF;
   INSERT INTO public.ai_usage_ledger(id,user_id,operation_id,kind)
   SELECT gen_random_uuid()::text,subject,operation.id,'release'
   WHERE EXISTS(SELECT 1 FROM public.ai_usage_ledger WHERE operation_id=operation.id AND kind='reserve')
   AND NOT EXISTS(SELECT 1 FROM public.ai_usage_ledger WHERE operation_id=operation.id AND kind IN ('settle','release'));
 END LOOP;
 RETURN NOT EXISTS(SELECT 1 FROM public.ai_operation WHERE user_id=subject AND budget_id IS NOT NULL AND (NOT budget_closed OR reserved_micros<>0));
END;
$$;
REVOKE ALL ON FUNCTION public.master_cv_quiesce_deleted_account(text) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.master_cv_erase_deleted_account(request_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE subject text; client record;
BEGIN
 SELECT subject_user_id INTO subject FROM public.account_deletion WHERE id=request_id
 AND subject_user_id=nullif(current_setting('app.user_id',true),'') FOR UPDATE;
 IF subject IS NULL THEN RAISE EXCEPTION 'DELETION_REQUEST_UNAVAILABLE'; END IF;
 PERFORM 1 FROM public."user" WHERE id=subject AND data_deletion_requested_at IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM public."user" WHERE id=subject) THEN RAISE EXCEPTION 'ADMISSION_NOT_CLOSED'; END IF;
  RETURN;
 END IF;
 IF NOT public.master_cv_quiesce_deleted_account(request_id) THEN RAISE EXCEPTION 'DELETION_WORK_PENDING'; END IF;
 -- No-FK verification owners and paired counters are removed in one statement.
 DELETE FROM public.verification WHERE public.master_cv_verification_owner(value)=subject
 OR identifier IN (SELECT '2fa-attempts-'||identifier FROM public.verification WHERE public.master_cv_verification_owner(value)=subject);
 DELETE FROM public.apikey WHERE reference_id=subject;
 -- Preserve shared client IDs and other users' associations while removing this
 -- subject's administrative identity and secrets. Unshared clients are erased.
 FOR client IN SELECT client_id FROM public.oauth_client WHERE user_id=subject OR reference_id=subject LOOP
  IF EXISTS(SELECT 1 FROM public.oauth_refresh_token WHERE client_id=client.client_id AND user_id<>subject)
   OR EXISTS(SELECT 1 FROM public.oauth_access_token WHERE client_id=client.client_id AND user_id<>subject)
   OR EXISTS(SELECT 1 FROM public.oauth_consent WHERE client_id=client.client_id AND user_id<>subject) THEN
   UPDATE public.oauth_client SET user_id=NULL,reference_id=NULL,client_secret=NULL,disabled=true,name=NULL,
   contacts=NULL,metadata=NULL,uri=NULL,icon=NULL,tos=NULL,policy=NULL,jwks=NULL,jwks_uri=NULL,
   software_statement=NULL,software_id=NULL,software_version=NULL WHERE client_id=client.client_id;
  ELSE DELETE FROM public.oauth_client WHERE client_id=client.client_id; END IF;
 END LOOP;
 -- Break source RESTRICT edges within the owner graph before deleting sources.
 UPDATE public.resume_variant_source SET source_resume_id=NULL WHERE user_id=subject;
 UPDATE public.resume SET base_resume_id=NULL,variant_kind='base' WHERE user_id=subject;
 DELETE FROM public.resume_fact_link WHERE user_id=subject;
 DELETE FROM public.resume_job_selection WHERE user_id=subject;
 DELETE FROM public.resume_variant_source WHERE user_id=subject;
 DELETE FROM public.ai_review_decision WHERE user_id=subject;
 DELETE FROM public.ai_import_review_source WHERE user_id=subject;
 DELETE FROM public.career_fact_revision WHERE user_id=subject;
 DELETE FROM public.ai_usage_ledger WHERE user_id=subject;
 DELETE FROM public."user" WHERE id=subject;
 -- Mutable cleanup rows have no subject FK by design and outlive erasure only
 -- until their delivery/cleanup purpose is complete.
 DELETE FROM public.privacy_work WHERE user_id=subject AND kind NOT IN ('delete_account','send_notice');
END;
$$;
REVOKE ALL ON FUNCTION public.master_cv_erase_deleted_account(text) FROM PUBLIC;
