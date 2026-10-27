-- FX outright ticks such as 6J's 0.0000005 must not round up to 0.000001.
-- Widen both storage locations; do not reinterpret existing stored values.
SET LOCAL lock_timeout = '3s';
DO $$
DECLARE
  relation_name TEXT;
  relation RECORD;
  definitions JSONB := '[]'::jsonb;
  saved JSONB;
  permission JSONB;
  index_definition TEXT;
  qualified_name TEXT;
  object_kind TEXT;
BEGIN
  -- The health view selects tick_size, and its materialized aggregate depends
  -- on that view. Save their actual definitions and grants rather than copying
  -- an older migration's column list or discarding backup-reader permissions.
  FOREACH relation_name IN ARRAY ARRAY['trades_with_health_analytics', 'health_trade_correlations'] LOOP
    SELECT c.oid, n.nspname AS schema_name, c.relname, c.relkind, c.reloptions,
           c.relispopulated, pg_get_userbyid(c.relowner) AS owner_name,
           pg_get_viewdef(c.oid, true) AS definition,
           obj_description(c.oid, 'pg_class') AS description,
           (SELECT jsonb_agg(jsonb_build_object(
             'role', CASE WHEN a.grantee=0 THEN NULL ELSE pg_get_userbyid(a.grantee) END,
             'privilege', a.privilege_type, 'grantable', a.is_grantable
           )) FROM aclexplode(c.relacl) a) AS permissions,
           (SELECT jsonb_agg(pg_get_indexdef(i.indexrelid))
            FROM pg_index i WHERE i.indrelid=c.oid) AS indexes
      INTO relation
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.oid=to_regclass(relation_name) AND c.relkind IN ('v','m');
    IF FOUND THEN
      definitions := definitions || jsonb_build_array(to_jsonb(relation));
    END IF;
  END LOOP;

  -- No CASCADE: unexpected downstream objects abort the transaction intact.
  DROP MATERIALIZED VIEW IF EXISTS health_trade_correlations;
  DROP VIEW IF EXISTS trades_with_health_analytics;
  ALTER TABLE trades ALTER COLUMN tick_size TYPE NUMERIC(20,10);
  ALTER TABLE instrument_templates ALTER COLUMN tick_size TYPE NUMERIC(20,10);

  FOR saved IN SELECT value FROM jsonb_array_elements(definitions) LOOP
    qualified_name := format('%I.%I', saved->>'schema_name', saved->>'relname');
    object_kind := CASE WHEN saved->>'relkind'='m' THEN 'MATERIALIZED VIEW' ELSE 'VIEW' END;
    EXECUTE format('CREATE %s %s %s AS %s %s', object_kind, qualified_name,
      CASE WHEN saved->'reloptions' <> 'null'::jsonb THEN
        'WITH (' || (SELECT string_agg(value, ',') FROM jsonb_array_elements_text(saved->'reloptions')) || ')'
        ELSE '' END,
      rtrim(saved->>'definition', E';\n '),
      CASE WHEN saved->>'relkind'='m' AND NOT (saved->>'relispopulated')::boolean
        THEN 'WITH NO DATA' ELSE '' END);
    EXECUTE format('ALTER %s %s OWNER TO %I', object_kind, qualified_name, saved->>'owner_name');
    FOR permission IN SELECT value FROM jsonb_array_elements(COALESCE(NULLIF(saved->'permissions','null'::jsonb),'[]'::jsonb)) LOOP
      EXECUTE format('GRANT %s ON TABLE %s TO %s %s', permission->>'privilege', qualified_name,
        CASE WHEN permission->>'role' IS NULL THEN 'PUBLIC' ELSE format('%I',permission->>'role') END,
        CASE WHEN (permission->>'grantable')::boolean THEN 'WITH GRANT OPTION' ELSE '' END);
    END LOOP;
    IF saved->>'description' IS NOT NULL THEN
      EXECUTE format('COMMENT ON %s %s IS %L', object_kind, qualified_name, saved->>'description');
    END IF;
    FOR index_definition IN SELECT value FROM jsonb_array_elements_text(COALESCE(NULLIF(saved->'indexes','null'::jsonb),'[]'::jsonb)) LOOP
      EXECUTE index_definition;
    END LOOP;
  END LOOP;
END $$;
