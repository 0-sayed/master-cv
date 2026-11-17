-- Custom SQL migration file, put your code below! --
ALTER TABLE "cover_letter_proposal_decision" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Extend only existing restricted runtime roles. Never grant schema ownership or role membership.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE NOT rolsuper AND NOT rolbypassrls
    AND has_table_privilege(oid,format('%I.career_fact_revision',current_schema()),'INSERT')
    AND NOT has_table_privilege(oid,format('%I.career_fact_revision',current_schema()),'UPDATE')
    AND NOT pg_has_role(oid,(SELECT relowner FROM pg_class WHERE oid=to_regclass(format('%I.career_fact_revision',current_schema()))),'MEMBER')
  LOOP
    EXECUTE format('GRANT SELECT,INSERT ON cover_letter_proposal_decision TO %I',r.rolname);
    EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE ON cover_letter_proposal_decision FROM %I',r.rolname);
  END LOOP;
END $$;
