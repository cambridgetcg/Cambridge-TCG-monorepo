import { db } from "../src/lib/db";
import { syncUkStock } from "../src/lib/sync-uk-stock";

async function main() {
  console.log("Re-syncing all UK stock (excluding A- condition)...");
  await syncUkStock();
  console.log("Done!");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
