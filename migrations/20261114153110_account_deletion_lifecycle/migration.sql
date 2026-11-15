CREATE FUNCTION public.master_cv_append_deletion_record(request_id text, stages jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE request public.account_deletion;
BEGIN
 SELECT * INTO request FROM public.account_deletion d WHERE d.id=request_id
 AND d.subject_user_id=nullif(current_setting('app.user_id',true),'') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'DELETION_REQUEST_UNAVAILABLE'; END IF;
 IF NOT coalesce((stages->>'admissionClosed')::boolean,false) THEN RAISE EXCEPTION 'DELETION_STAGE_INVALID'; END IF;
 IF (stages->>'databaseRemoved')::boolean AND EXISTS(SELECT 1 FROM public."user" WHERE id=request.subject_user_id) THEN RAISE EXCEPTION 'DELETION_STAGE_INVALID'; END IF;
 INSERT INTO public.deletion_replay_record(request_id,subject_user_ids,storage_scopes,requested_at,
 active_data_completed_at,completed_at,admission_closed,work_quiesced,renewals_stopped,objects_removed,database_removed,processors,policy_version)
 VALUES (request.id,ARRAY[request.subject_user_id],ARRAY['uploads/'||request.subject_user_id||'/'],request.requested_at,
 CASE WHEN (stages->>'databaseRemoved')::boolean AND (stages->>'objectsRemoved')::boolean THEN now() END,
 request.completed_at,true,(stages->>'workQuiesced')::boolean,stages->>'renewalsStopped',
 (stages->>'objectsRemoved')::boolean,(stages->>'databaseRemoved')::boolean,stages->>'processors',request.policy_version);
END;
$$;
REVOKE ALL ON FUNCTION public.master_cv_append_deletion_record(text,jsonb) FROM PUBLIC;
--> statement-breakpoint
-- Only a separately provisioned recovery role receives EXECUTE. The application
-- role cannot SELECT the append-only table or invoke this reader.
CREATE FUNCTION public.master_cv_read_deletion_records(after_sequence bigint, batch_limit integer)
RETURNS SETOF public.deletion_replay_record
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT * FROM public.deletion_replay_record WHERE sequence>after_sequence ORDER BY sequence
 LIMIT greatest(1,least(batch_limit,1000))
$$;
REVOKE ALL ON FUNCTION public.master_cv_read_deletion_records(bigint,integer) FROM PUBLIC;
