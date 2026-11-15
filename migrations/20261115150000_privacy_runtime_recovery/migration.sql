-- Preserve existing restricted runtime credentials while upgrading their T009 privileges.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE NOT rolsuper AND NOT rolbypassrls
    AND has_table_privilege(oid,'public.career_fact_revision','INSERT')
    AND NOT has_table_privilege(oid,'public.career_fact_revision','UPDATE')
    AND NOT pg_has_role(oid,(SELECT relowner FROM pg_class WHERE oid='public.career_fact_revision'::regclass),'MEMBER')
  LOOP
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON account_email_change,account_action_proof,stored_file,privacy_work,account_data_export,account_deletion,support_request TO %I',r.rolname);
    EXECUTE format('REVOKE ALL ON deletion_replay_record,support_access_log FROM %I',r.rolname);
    EXECUTE format('GRANT EXECUTE ON FUNCTION master_cv_submit_support(text,text,text,text,text,text,text),master_cv_support_delivery(text,text),master_cv_privacy_trash_owners(timestamptz,integer),master_cv_privacy_work_owner(text),master_cv_append_deletion_record(text,jsonb),master_cv_quiesce_deleted_account(text),master_cv_erase_deleted_account(text),master_cv_privacy_queue_owners() TO %I',r.rolname);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE POLICY discovery_owner_read ON resume FOR SELECT TO current_user USING (true);
CREATE POLICY discovery_owner_read ON cover_letter FOR SELECT TO current_user USING (true);
--> statement-breakpoint
CREATE TRIGGER account_admission BEFORE INSERT OR UPDATE ON support_request
FOR EACH ROW EXECUTE FUNCTION public.master_cv_guard_account_write('user_id');
