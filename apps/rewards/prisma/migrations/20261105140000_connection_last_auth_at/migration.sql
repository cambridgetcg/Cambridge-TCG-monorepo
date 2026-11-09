-- Task A14 (Ruling 13): when the store last opened the app (every token
-- exchange, hooks.afterAuth). An app/uninstalled whose X-Shopify-Triggered-At
-- is not after the later of activated_at and last_auth_at is stale: a
-- reinstall overtook it, so it neither marks the connection nor deletes the
-- fresh session. Null until the store's next open. It is not activated_at,
-- which bounds recordOrder's gap rule and moves only at a reactivation.
ALTER TABLE "connection" ADD COLUMN "last_auth_at" TIMESTAMP(3);
