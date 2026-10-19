-- Prepares an empty Postgres for the integration tests the way Supabase is
-- provisioned: the app role owns schema rewardspro, has no CREATE on the
-- database, and defaults its search_path to that schema. Run as a superuser,
-- then apply prisma/migrations as rewardspro_app.
CREATE ROLE rewardspro_app LOGIN PASSWORD 'rewardspro_app';
CREATE SCHEMA rewardspro AUTHORIZATION rewardspro_app;
ALTER ROLE rewardspro_app SET search_path = rewardspro;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
