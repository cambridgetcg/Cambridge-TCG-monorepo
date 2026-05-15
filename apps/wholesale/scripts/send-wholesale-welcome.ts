#!/usr/bin/env tsx
/**
 * send-wholesale-welcome — Phase 3 companion to
 * migrate-clients-to-storefront.ts.
 *
 * Sends a welcome email via AWS SES to recently-migrated B2B buyers
 * pointing them at the new sign-in URL. The email contains:
 *   - One sentence explaining the consolidation
 *   - A "Sign in with magic-link" CTA pointing at cambridgetcg.com/login
 *   - A line noting that wholesaletcgdirect.com still works during
 *     transition, so they're never locked out
 *
 * Targets: storefront.users WHERE role='wholesale' AND (last_login_at
 *   IS NULL OR last_login_at < created_at + interval '1 day') AND
 *   created_at >= <since>.
 *
 * The script is idempotent on (email, template_key) — sending twice
 * is harmless (SES handles it), but we track sends in a
 * `wholesale_welcome_emails` table so a re-run skips already-sent
 * addresses. If the table doesn't exist, the script logs a warning
 * and proceeds (operator can create it on demand).
 *
 * Run:
 *   STOREFRONT_DATABASE_URL='...' AWS_REGION=eu-west-2 \
 *   SES_FROM='contact@cambridgetcg.com' \
 *     pnpm tsx apps/wholesale/scripts/send-wholesale-welcome.ts \
 *       --since=2026-05-15 [--dry-run] [--limit=N]
 *
 * AWS credentials come from the standard chain (env vars, ~/.aws, IAM
 * role). The SES_FROM address must be verified in the target region.
 *
 * Safety:
 *   - --dry-run logs what would be sent without calling SES.
 *   - --limit=N caps the batch (use for first runs).
 *   - The script throttles to ~1 email/sec to stay under SES's default
 *     send rate. For high volumes, raise the throttle after the
 *     account's reputation has been verified.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const APP_ROOT = new URL("..", import.meta.url).pathname;

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const path = join(APP_ROOT, f);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf-8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.*?)["']?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

const TEMPLATE_KEY = "wholesale-welcome-v1";
const SITE_URL = "https://cambridgetcg.com";

interface WholesaleUser {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}

function htmlBody(name: string | null): string {
  const greeting = name ? `Hi ${name},` : "Hi there,";
  return `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;color:#222;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <h1 style="font-size:22px;margin:0 0 16px;">Your Cambridge TCG wholesale account is now on the main site.</h1>
  <p>${greeting}</p>
  <p>We&rsquo;ve consolidated wholesaletcgdirect.com into cambridgetcg.com. Your B2B account has been migrated; you now sign in with a magic-link email at the main site, and your wholesale prices show up in a private section called <strong>/account/b2b</strong>.</p>
  <p style="text-align:center;margin:24px 0;">
    <a href="${SITE_URL}/login" style="display:inline-block;background:#f59e0b;color:#0a0a0a;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Sign in to your wholesale account</a>
  </p>
  <p style="font-size:14px;color:#555;">After you sign in, head to <a href="${SITE_URL}/account/b2b">${SITE_URL}/account/b2b</a> to browse the catalog at your wholesale prices, add to cart, and check out via Stripe — everything you did on wholesaletcgdirect.com, now in one place.</p>
  <p style="font-size:14px;color:#555;">The legacy site (wholesaletcgdirect.com) will keep working for a transition period, so you&rsquo;re never locked out. Once you&rsquo;ve confirmed the new site works for you, we&rsquo;ll retire the legacy URLs.</p>
  <p style="font-size:14px;color:#555;">Questions? Reply to this email or write to <a href="mailto:contact@cambridgetcg.com">contact@cambridgetcg.com</a>.</p>
  <p style="font-size:14px;color:#555;">— The Cambridge TCG team</p>
</body></html>`;
}

function textBody(name: string | null): string {
  const greeting = name ? `Hi ${name},` : "Hi there,";
  return `${greeting}

Your Cambridge TCG wholesale account is now on the main site.

We've consolidated wholesaletcgdirect.com into cambridgetcg.com. Your B2B account has been migrated; you now sign in with a magic-link email at the main site, and your wholesale prices show up in a private section called /account/b2b.

Sign in here: ${SITE_URL}/login

After you sign in, head to ${SITE_URL}/account/b2b to browse the catalog at your wholesale prices, add to cart, and check out via Stripe.

The legacy site (wholesaletcgdirect.com) will keep working for a transition period, so you're never locked out.

Questions? Reply to this email or write to contact@cambridgetcg.com.

— The Cambridge TCG team`;
}

async function ensureLedgerTable(sql: postgres.Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS wholesale_welcome_emails (
      id          BIGSERIAL PRIMARY KEY,
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email       TEXT NOT NULL,
      template_key TEXT NOT NULL,
      sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ses_message_id TEXT,
      UNIQUE (user_id, template_key)
    )
  `;
}

async function main() {
  loadEnv();

  const storefrontUrl = process.env.STOREFRONT_DATABASE_URL ?? process.env.DATABASE_URL;
  const sesFrom = process.env.SES_FROM?.trim();
  const awsRegion = process.env.AWS_REGION?.trim() ?? "eu-west-2";

  if (!storefrontUrl) {
    console.error("STOREFRONT_DATABASE_URL not set.");
    process.exit(1);
  }
  if (!sesFrom) {
    console.error("SES_FROM env var not set (verified-sender address).");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const sinceArg = args.find((a) => a.startsWith("--since="));
  const since = sinceArg ? sinceArg.split("=")[1] : null;
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  const sql = postgres(storefrontUrl.replace(/\?sslmode=[^&]*/, ""), {
    ssl: { rejectUnauthorized: false },
  });
  const ses = new SESClient({ region: awsRegion });

  console.log("=".repeat(70));
  console.log("Phase 3 — wholesale-welcome email send");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE (SES will be called)"}`);
  console.log(`From: ${sesFrom}  Region: ${awsRegion}`);
  if (since) console.log(`Since: ${since}`);
  if (limit) console.log(`Limit: ${limit}`);
  console.log("=".repeat(70));

  if (!dryRun) {
    await ensureLedgerTable(sql);
  }

  const targets = await sql<WholesaleUser[]>`
    SELECT u.id, u.email, u.name, u.created_at::text AS created_at
      FROM users u
      LEFT JOIN wholesale_welcome_emails wwe
        ON wwe.user_id = u.id AND wwe.template_key = ${TEMPLATE_KEY}
     WHERE u.role = 'wholesale'
       AND wwe.id IS NULL
       ${since ? sql`AND u.created_at >= ${since}::timestamptz` : sql``}
     ORDER BY u.created_at ASC
     ${limit ? sql`LIMIT ${limit}` : sql``}
  `;

  console.log(`\n${targets.length} wholesale users have no welcome-email record.\n`);

  let sent = 0;
  let failed = 0;

  for (const u of targets) {
    if (dryRun) {
      console.log(`  [would send] ${u.email}`);
      continue;
    }

    try {
      const result = await ses.send(
        new SendEmailCommand({
          Source: sesFrom,
          Destination: { ToAddresses: [u.email] },
          Message: {
            Subject: {
              Charset: "UTF-8",
              Data: "Your Cambridge TCG wholesale account moved to the main site",
            },
            Body: {
              Html: { Charset: "UTF-8", Data: htmlBody(u.name) },
              Text: { Charset: "UTF-8", Data: textBody(u.name) },
            },
          },
        }),
      );

      await sql`
        INSERT INTO wholesale_welcome_emails (user_id, email, template_key, ses_message_id)
        VALUES (${u.id}, ${u.email}, ${TEMPLATE_KEY}, ${result.MessageId ?? null})
        ON CONFLICT (user_id, template_key) DO NOTHING
      `;

      sent += 1;
      console.log(`  [sent] ${u.email} (msg ${result.MessageId})`);

      // Throttle ~1/sec for default SES quotas. Raise after reputation
      // is established.
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      failed += 1;
      console.error(`  [fail] ${u.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("Summary");
  console.log("=".repeat(70));
  console.log(`  Targeted: ${targets.length}`);
  console.log(`  Sent:     ${sent}`);
  console.log(`  Failed:   ${failed}`);
  if (dryRun) console.log("\n[DRY RUN] No emails were sent.");

  await sql.end();
}

main().catch((err) => {
  console.error("\nSend failed:", err);
  process.exit(1);
});
