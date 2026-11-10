-- Recheck legacy references for schema owners without BYPASSRLS. The earlier scan
-- ran after FORCE RLS and could see no private rows. Keep the FORCE changes and
-- validation in one statement: failure rolls them back, success restores them.
DO $migration$
DECLARE
  protected_tables regclass[];
  protected_table regclass;
  link record;
  invalid boolean;
BEGIN
  SELECT coalesce(array_agg(c.oid::regclass ORDER BY c.oid), ARRAY[]::regclass[])
    INTO protected_tables
    FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname=current_schema() AND c.relkind='r'
      AND c.relrowsecurity AND c.relforcerowsecurity;

  FOREACH protected_table IN ARRAY protected_tables LOOP
    EXECUTE format('ALTER TABLE %s NO FORCE ROW LEVEL SECURITY', protected_table);
  END LOOP;

  FOR link IN
    SELECT child.relname AS child_table, parent.relname AS parent_table,
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
  END LOOP;

  FOREACH protected_table IN ARRAY protected_tables LOOP
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', protected_table);
  END LOOP;
END;
$migration$;
