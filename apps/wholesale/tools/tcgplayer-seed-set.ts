#!/usr/bin/env tsx
/**
 * tcgplayer-seed-set — deliberately blocked.
 *
 * The historical mapper remains in git history. This command now refuses
 * before loading the database or touching the network because Cambridge has
 * no written approval for its multi-source use. Credentials are not enough.
 */

const message = [
  "tcgplayer:seed-set is blocked.",
  "",
  "TCGplayer is not granting new API access, and Cambridge has no recorded",
  "written approval for its multi-source aggregation or redistribution use.",
  "No database or network work was attempted.",
  "",
  "Reopening requires a dated rights review and an explicit code change.",
].join("\n");

console.error(message);
process.exitCode = 2;
