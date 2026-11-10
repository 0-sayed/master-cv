CREATE POLICY "discovery_owner_read" ON "agent_threads" AS PERMISSIVE FOR SELECT TO current_user USING (true);--> statement-breakpoint
CREATE POLICY "discovery_owner_read" ON "career_job" AS PERMISSIVE FOR SELECT TO current_user USING (true);--> statement-breakpoint
CREATE POLICY "discovery_owner_read" ON "career_notification" AS PERMISSIVE FOR SELECT TO current_user USING (true);--> statement-breakpoint
CREATE POLICY "discovery_owner_read" ON "career_schedule" AS PERMISSIVE FOR SELECT TO current_user USING (true);