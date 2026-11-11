ALTER TABLE "resume" ADD COLUMN "import_flow_id" text;--> statement-breakpoint
ALTER TABLE "resume" ADD COLUMN "import_flow_hash" text;--> statement-breakpoint
ALTER TABLE "resume" ADD CONSTRAINT "resume_import_flow_unique" UNIQUE("user_id","import_flow_id");--> statement-breakpoint
ALTER TABLE "resume" ADD CONSTRAINT "resume_import_flow_pair" CHECK (("import_flow_id" IS NULL) = ("import_flow_hash" IS NULL));