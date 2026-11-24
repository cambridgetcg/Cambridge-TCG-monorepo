// The guest walk (src/lib/guest-walk.ts) by hand, and from health.yml.
// Node 22.18 or newer runs it as it is, with nothing installed:
//   node apps/storefront/scripts/guest-walk.mts [--base=http://localhost:3001] [--inside]
// --inside leaves out the question only an outsider asks: did the daily check run.
import { guestWalk, walkReport } from "../src/lib/guest-walk.ts";

const base = process.argv.find(arg => arg.startsWith("--base="))?.slice("--base=".length);
const walk = await guestWalk({ base, outside: !process.argv.includes("--inside") });
console.log(walkReport(walk));
process.exitCode = walk.failed.length ? 1 : 0;
