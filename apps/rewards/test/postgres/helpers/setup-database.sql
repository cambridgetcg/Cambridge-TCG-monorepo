-- Prepares an empty test Postgres the way Supabase is provisioned for
-- RewardsPro: the app role owns schema rewards, has no CREATE on the
-- database, and defaults its search_path to that schema. Run as a superuser
-- (scripts/test-db.sh, CI), then apply prisma/migrations as rewards_app.
-- Test databases only. Production's role and schema are created by hand.
CREATE ROLE rewards_app LOGIN PASSWORD 'rewards_app';
CREATE SCHEMA rewards AUTHORIZATION rewards_app;
ALTER ROLE rewards_app SET search_path = rewards;
