import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * OPERATIONS-5: the budgets (the crons' 240 s, CLAIM_FINISHED_MS, the
 * send window) assume Vercel stops a function at 300 s, so every webhook
 * and cron route sets it. vercelPreset reads each route's `config` through
 * @vercel/static-config, which parses the file rather than running it, so
 * the export must be this literal object in the route's own file.
 */

const routes = fileURLToPath(new URL("../../../app/routes/", import.meta.url));
const ceilinged = readdirSync(routes).filter((file) => /^(webhooks|api\.cron)\./.test(file));

describe("the 300 s ceiling", () => {
  it("covers every webhook route and the three cron routes", () => {
    expect(ceilinged.filter((file) => file.startsWith("api.cron.")).sort()).toEqual([
      "api.cron.housekeeping.tsx",
      "api.cron.payouts.tsx",
      "api.cron.tiers.tsx",
    ]);
    expect(ceilinged.filter((file) => file.startsWith("webhooks.")).length).toBe(11);
  });

  it.each(ceilinged)("%s exports config = { maxDuration: 300 }", (file) => {
    expect(readFileSync(`${routes}${file}`, "utf8")).toMatch(/^export const config = \{ maxDuration: 300 \};$/m);
  });
});
