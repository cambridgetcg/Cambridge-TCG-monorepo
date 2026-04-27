// Confirms collectDigestStats runs against the real DB and renders
// without errors. Writes the HTML body to /tmp/admin-digest.html for
// eyeball review.

import { writeFileSync } from "node:fs";
import pg from "pg";
const { collectDigestStats } = await import("../src/lib/email/admin-digest");
const { renderLayout } = await import("../src/lib/email/layout");

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  const stats = await collectDigestStats();
  console.log("stats:", JSON.stringify(stats, null, 2));

  // Render a dummy layout around the stats to sanity-check template.
  const html = renderLayout({
    heading: "Digest preview",
    bodyHtml: `<pre style="color:#a3a3a3;font-size:11px;">${JSON.stringify(stats, null, 2)}</pre>`,
  });
  writeFileSync("/tmp/admin-digest.html", html);
  console.log("wrote /tmp/admin-digest.html");
} finally {
  await pool.end();
}
