## Why

<!-- What changed and why. The diff already shows the what; the reasoning is what the next person needs. -->

## How tested

<!-- What you ran, what failed, and what you didn't check. -->

<!-- apps/rewards PR that adds a migration: apply it to production and see migrate:drift pass, then merge (apps/rewards/docs/switch.md, "A pull request with a migration"); the production build refuses a commit whose migrations production lacks. Put the read-back queries in the body: each new column from information_schema.columns and each new index from pg_indexes, with the row count expected. -->
