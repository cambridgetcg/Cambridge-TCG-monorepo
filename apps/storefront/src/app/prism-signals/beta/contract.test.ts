import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

describe("PRISM Signals closed-beta surface contract", () => {
  it("keeps the gated page noindex and the public PRISM page as its sitemap door", () => {
    const page = source("./page.tsx");
    const sitemap = source("../../sitemap.ts");
    expect(page).toContain("robots: { index: false, follow: false, nocache: true }");
    expect(page).toContain("const intakeEnabled = prismSignalsBetaIntakeEnabled()");
    expect(page).not.toContain("if (!prismSignalsBetaIntakeEnabled()) return");
    expect(page).toContain('redirect("/login?return=/prism-signals/beta")');
    expect(sitemap).not.toContain("url: `${baseUrl}/prism-signals/beta`");
    expect(sitemap).toContain("/prism-signals/beta is login-gated and noindex");
  });

  it("keeps the public beta claim behind a config-only, no-I/O gate", () => {
    const landing = source("../page.tsx");
    const config = source("../../../lib/prism-signals/beta-interest-config.server.ts");
    expect(landing).toContain("const intakeEnabled = prismSignalsBetaIntakeEnabled()");
    expect(landing).toContain("{intakeEnabled ? (");
    expect(landing).toContain("export function generateMetadata()");
    expect(config).not.toMatch(/@\/lib\/db|@\/lib\/auth|query\(|auth\(/);
  });

  it("uses a separate unticked, specific contact affirmation and easy withdrawal", () => {
    const form = source("./BetaInterestForm.tsx");
    expect(form).toContain("useState(false)");
    expect(form).toContain("Cambridge TCG");
    expect(form).toMatch(
      /account\s+email only for a PRISM beta invitation or status update/,
    );
    expect(form).toContain("not general marketing");
    expect(form).toContain("Withdraw and delete request");
    expect(form).toContain("Withdrawal is immediate and carries no penalty");
    expect(form).toContain("does not link an account or permit a bot message");
  });

  it("creates bounded generic runtime storage and an append-only event log", () => {
    const sql = source("../../../../drizzle/0135_product_flow_runtime.sql");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS product_flow_events");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS product_flow_entitlement_snapshots");
    expect(sql).toContain("product_flow_events_no_update");
    expect(sql).toContain("product_flow_events_no_delete");
    expect(sql).toContain("product flow events are append-only");
    expect(sql).toContain("octet_length(event_payload::text) <= 65536");
    expect(sql).toContain("ON product_flow_events(environment, provider_event_ref)");
    expect(sql).toContain("ON product_flow_events(environment, rail, payment_ref)");
    expect(sql).toContain("WHERE event_type IN ('payment_confirmed', 'renewal_confirmed')");
    expect(sql).not.toMatch(/stripe_session_id|telegram_payment_charge_id|customer_email/i);
  });

  it("stores one future-safe, owner-deletable interest row with hard expiry", () => {
    const sql = source("../../../../drizzle/0135_product_flow_runtime.sql");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS product_beta_interests");
    expect(sql).toContain("user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE");
    expect(sql).toContain("char_length(product_id) <= 96");
    expect(sql).not.toContain("CHECK (product_id = 'prism-signals')");
    expect(sql).toContain("ARRAY['web', 'telegram']::TEXT[]");
    expect(sql).toContain("expires_at TIMESTAMPTZ(3) NOT NULL");
    expect(sql).toContain("CHECK (updated_at < expires_at)");
    expect(sql).not.toMatch(/email|telegram_user|queue_(?:rank|position)|entitlement_id/i);
  });

  it("publishes the privacy, manifest, and daily-retention truth", () => {
    const privacy = source("../../privacy/page.tsx");
    const manifest = source("../../../lib/manifest.ts");
    const summary = source("../../methodology/prism-signals/summary.md");
    const vercel = JSON.parse(source("../../../../vercel.json")) as {
      crons: Array<{ path: string; schedule: string }>;
    };

    expect(privacy).toContain('id="prism-signals-beta"');
    expect(privacy).toContain("The beta table stores no new copy of your email address");
    expect(privacy).toContain("expires 180 days");
    expect(privacy).toContain("A daily authenticated");
    expect(privacy).toContain("not general marketing consent");
    expect(summary).toContain("not general marketing consent");
    expect(summary).not.toMatch(/is not marketing consent[,.;]/i);
    expect(manifest).toContain('id: "storefront.prism-signals-beta"');
    expect(manifest).toContain('id: "storefront.prism-signals-beta-interest"');
    expect(manifest).toContain('auth: "user"');
    expect(vercel.crons).toContainEqual({
      path: "/api/cron/prism-signals-beta-retention",
      schedule: "17 4 * * *",
    });
  });
});
