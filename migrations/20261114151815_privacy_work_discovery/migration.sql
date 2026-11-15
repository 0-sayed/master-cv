-- Custom SQL migration file, put your code below! --
CREATE FUNCTION master_cv_privacy_trash_owners(cutoff timestamptz, batch_limit integer)
RETURNS TABLE(user_id text) LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
 SELECT DISTINCT candidate.user_id FROM (
 SELECT r.user_id FROM public.resume r JOIN public."user" u ON u.id=r.user_id WHERE r.trashed_at <= cutoff AND u.data_deletion_requested_at IS NULL
 UNION ALL
 SELECT c.user_id FROM public.cover_letter c JOIN public."user" u ON u.id=c.user_id WHERE c.trashed_at <= cutoff AND u.data_deletion_requested_at IS NULL
 ) candidate ORDER BY candidate.user_id LIMIT greatest(1,least(batch_limit,100));
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION master_cv_privacy_trash_owners(timestamptz,integer) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION master_cv_privacy_work_owner(work_id text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT w.user_id FROM public.privacy_work w WHERE w.id=work_id LIMIT 1;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION master_cv_privacy_work_owner(text) FROM PUBLIC;
