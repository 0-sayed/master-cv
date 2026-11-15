CREATE POLICY "queue_owner_write" ON "privacy_work" AS PERMISSIVE FOR ALL TO current_user USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "intake_owner_write" ON "support_request" AS PERMISSIVE FOR ALL TO current_user USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE FUNCTION master_cv_submit_support(case_id text, subject_id text, nonce text, contact text, topic text, body text, language text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior support_request; scope text; BEGIN
 IF length(nonce) NOT BETWEEN 1 AND 128 OR length(body) NOT BETWEEN 1 AND 10000 OR length(trim(body))=0 OR length(contact)>254 OR contact ~ E'[\r\n]' OR contact !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' OR topic NOT IN ('export','plan','privacy','other') OR language NOT IN ('ar-SA','en-US') THEN RAISE EXCEPTION 'SUPPORT_INVALID_INPUT'; END IF;
 IF subject_id IS NOT NULL AND (subject_id IS DISTINCT FROM nullif(current_setting('app.user_id',true),'') OR NOT EXISTS(SELECT 1 FROM "user" WHERE id=subject_id AND data_deletion_requested_at IS NULL)) THEN RAISE EXCEPTION 'SUPPORT_INVALID_SUBJECT'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('support-intake',0));
 SELECT * INTO prior FROM support_request WHERE request_nonce=nonce;
 IF FOUND THEN
  IF prior.user_id IS NOT DISTINCT FROM subject_id AND prior.email=contact AND prior.subject=topic AND prior.message=body AND prior.locale=language THEN RETURN prior.id; END IF;
  RAISE EXCEPTION 'SUPPORT_NONCE_REUSED';
 END IF;
 IF (SELECT count(*) FROM support_request WHERE created_at>now()-interval '5 minutes' AND email=contact)>=5 OR (SELECT count(*) FROM support_request WHERE created_at>now()-interval '5 minutes')>=100 THEN RAISE EXCEPTION 'SUPPORT_RATE_LIMIT'; END IF;
 INSERT INTO support_request(id,user_id,request_nonce,email,subject,message,locale) VALUES(case_id,subject_id,nonce,contact,topic,body,language);
 scope:=coalesce(subject_id,'support-case:'||case_id);
 INSERT INTO privacy_work(id,user_id,kind,request_id,key) VALUES(case_id,scope,'send_support',case_id,'support:'||case_id);
 RETURN case_id;
END $$;
REVOKE ALL ON FUNCTION master_cv_submit_support(text,text,text,text,text,text,text) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION master_cv_support_delivery(work_id text, lease text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; BEGIN
 SELECT jsonb_build_object('id',s.id,'userId',s.user_id,'email',s.email,'subject',s.subject,'message',s.message,'locale',s.locale,'requestNonce',s.request_nonce,'status',s.status) INTO result
 FROM support_request s JOIN privacy_work w ON w.request_id=s.id WHERE w.id=work_id AND w.kind='send_support' AND w.status='running' AND w.lease_token=lease AND w.lease_until>now() AND w.user_id=current_setting('app.user_id',true);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION master_cv_support_delivery(text,text) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION master_cv_read_support_request(operator_id text, case_id text, reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; BEGIN
 IF operator_id IS DISTINCT FROM session_user OR length(trim(reason)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'SUPPORT_OPERATOR_SCOPE_REQUIRED'; END IF;
 SELECT jsonb_build_object('id',s.id,'userId',s.user_id,'email',s.email,'subject',s.subject,'message',s.message,'locale',s.locale,'requestNonce',s.request_nonce,'status',s.status) INTO result FROM support_request s WHERE s.id=case_id;
 IF result IS NULL THEN RAISE EXCEPTION 'SUPPORT_CASE_NOT_FOUND'; END IF;
 INSERT INTO support_access_log(id,operator_id,request_id,purpose) VALUES(gen_random_uuid()::text,operator_id,case_id,reason);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION master_cv_read_support_request(text,text,text) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION master_cv_support_disposition(operator_id text,case_id text,decision text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF operator_id IS DISTINCT FROM session_user OR length(trim(decision)) NOT BETWEEN 1 AND 200 OR NOT EXISTS(SELECT 1 FROM support_request WHERE id=case_id) THEN RAISE EXCEPTION 'SUPPORT_OPERATOR_SCOPE_REQUIRED'; END IF;
 INSERT INTO support_access_log(id,operator_id,request_id,purpose,disposition) VALUES(gen_random_uuid()::text,operator_id,case_id,'case disposition',decision);
END $$;
REVOKE ALL ON FUNCTION master_cv_support_disposition(text,text,text) FROM PUBLIC;
