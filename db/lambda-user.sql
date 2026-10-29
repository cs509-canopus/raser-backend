-- Login role used by Lambda functions. It has no password: membership in rds_iam
-- means it can only log in with an IAM auth token.
-- Roles are instance-wide, so this part only does anything the first time.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'raser_lambda') THEN
    CREATE ROLE raser_lambda WITH LOGIN;
  END IF;
END
$$;
GRANT rds_iam TO raser_lambda;

-- Privileges are per-database: run this file against every stage's database.
GRANT USAGE ON SCHEMA public TO raser_lambda;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO raser_lambda;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO raser_lambda;

-- Tables raser_admin creates later (e.g. re-running schema.sql) get the same grants
ALTER DEFAULT PRIVILEGES FOR ROLE raser_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO raser_lambda;
ALTER DEFAULT PRIVILEGES FOR ROLE raser_admin IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO raser_lambda;

