-- Row-Level Security: DB-layer tenant isolation (defense in depth).
--
-- The app connects as the non-superuser role `devicelock_app`. Each request
-- sets `app.tenant_id` (a GUC) to the caller's tenant; these policies then make
-- Postgres physically refuse rows from any other tenant — even if an app-layer
-- query forgot to filter. With the GUC unset, NULLIF(...) -> NULL and the
-- predicate is false, so the default is DENY (zero rows).
--
-- FORCE ROW LEVEL SECURITY ensures the policy also applies to the table owner,
-- not just to unprivileged roles.

-- Helper: current tenant from the connection GUC (NULL when unset).
-- Prisma maps `String` ids to Postgres `text`, so this returns text to match
-- the "tenantId" column type.
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'User','Customer','Device','EnrollmentToken',
    'Loan','Installment','Payment','DeviceCommand','DeviceEvent'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    -- Reads/writes restricted to the current tenant.
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("tenantId" = app_current_tenant())',
      t
    );
    -- Inserts must carry the current tenant id.
    EXECUTE format(
      'CREATE POLICY tenant_insert ON %I FOR INSERT WITH CHECK ("tenantId" = app_current_tenant())',
      t
    );

    -- Make sure the runtime role can actually use the table.
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO devicelock_app', t);
  END LOOP;
END$$;

-- Tables without a tenantId are scoped indirectly (RefreshToken via User);
-- still grant DML to the runtime role.
GRANT SELECT, INSERT, UPDATE, DELETE ON "RefreshToken", "Tenant" TO devicelock_app;