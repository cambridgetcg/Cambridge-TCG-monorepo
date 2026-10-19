import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { action as customersUpdate } from "~/routes/webhooks.customers.update";
import { action as customersCreate } from "~/routes/webhooks.customers.create";
import { action as unsubscribePost, loader as unsubscribeGet } from "~/routes/email.unsubscribe";
import { syncCustomersInBackground } from "~/services/background-customer-sync.server";
import { sendCampaignEmails } from "~/services/email-notifications.server";
import { verifyUnsubscribeToken } from "~/services/marketing-consent.server";
import { sendMarketingEmail } from "~/services/marketing-email.server";
import { server } from "../../mocks/server";
import { hasTestDatabase, resetDatabase } from "./database";
import { seedOfflineSession, signedWebhook } from "./shopify";

const SHOP = "consent-test.myshopify.com";

type SentMail = {
  personalizations: Array<{ to: Array<{ email: string }>; headers: Record<string, string>; substitutions: Record<string, string> }>;
  content: Array<{ type: string; value: string }>;
};

/** SendGrid's mail/send, answered by MSW; returns the requests sent. */
function mockSendGrid(): SentMail[] {
  const sent: SentMail[] = [];
  server.use(
    http.post("https://api.sendgrid.com/v3/mail/send", async ({ request }) => {
      sent.push((await request.json()) as SentMail);
      return new HttpResponse(null, { status: 202 });
    }),
  );
  return sent;
}

async function customer(email: string, consent: { acceptsMarketing?: boolean; emailSuppressed?: boolean } = {}) {
  return prisma.customer.create({
    data: { shop: SHOP, shopifyCustomerId: String(Math.floor(Math.random() * 1e9)), email, ...consent },
  });
}

function unsubscribeRequest(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe.skipIf(!hasTestDatabase)("email marketing consent on Postgres", () => {
  const env = { ...process.env };

  beforeEach(async () => {
    await resetDatabase();
    await prisma.shopSettings.create({ data: { shop: SHOP, storeName: "Card & Co <Shop>", storeUrl: `https://${SHOP}` } });
    process.env.SENDGRID_API_KEY = "SG.test";
    process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY = "test-verification-key";
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("defaults new customers to no consent", async () => {
    const created = await prisma.customer.create({ data: { shop: SHOP, shopifyCustomerId: "1", email: "a@example.test" } });
    expect(created.acceptsMarketing).toBe(false);
  });

  it("sends marketing only to consenting customers, each with their own unsubscribe link and headers", async () => {
    const sent = mockSendGrid();
    const yes = await customer("yes@example.test", { acceptsMarketing: true });
    const never = await customer("never@example.test");
    const bounced = await customer("bounced@example.test", { acceptsMarketing: true, emailSuppressed: true });
    const unsubscribed = await customer("unsubscribed@example.test", { acceptsMarketing: true });
    const emailOnly = await customer("Mixed.Case@Example.test", { acceptsMarketing: true });
    await unsubscribeGet({ request: unsubscribeRequest(await unsubscribeLinkFor(unsubscribed.id)), params: {}, context: {} });

    const result = await sendMarketingEmail(
      SHOP,
      [{ customerId: yes.id }, { customerId: never.id }, { customerId: bounced.id }, { customerId: unsubscribed.id }, { email: "mixed.case@example.test" }],
      { subject: "Sale", html: "<p>Hello</p>", categories: ["campaign"] },
    );

    expect(result).toMatchObject({ sent: 2, skipped: 3, failed: 0 });
    expect(sent).toHaveLength(1);
    const [mail] = sent;
    // One personalization per recipient: nobody sees another address
    expect(mail.personalizations.map((p) => p.to.map((t) => t.email))).toEqual(
      expect.arrayContaining([[yes.email], [emailOnly.email]]),
    );
    for (const p of mail.personalizations) {
      expect(p.to).toHaveLength(1);
      const link = p.headers["List-Unsubscribe"].replace(/^<|>$/g, "");
      expect(p.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      expect(p.substitutions["-rp_unsubscribe_url-"]).toBe(link);
      const target = verifyUnsubscribeToken(new URL(link).searchParams.get("token"));
      const recipient = p.to[0].email === yes.email ? yes : emailOnly;
      expect(target).toEqual({ shop: SHOP, customerId: recipient.id });
    }
    const html = mail.content.find((c) => c.type === "text/html")!.value;
    expect(html).toContain('href="-rp_unsubscribe_url-"');
    // The store name is escaped in the footer
    expect(html).toContain("Card &amp; Co &lt;Shop&gt;");
  });

  it("sends nothing while SendGrid's signed event webhook is not configured", async () => {
    const sent = mockSendGrid();
    delete process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;
    const yes = await customer("yes@example.test", { acceptsMarketing: true });

    const result = await sendMarketingEmail(SHOP, [{ customerId: yes.id }], { subject: "Sale", html: "<p>Hi</p>" });

    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(result.errors[0]).toMatch(/SENDGRID_WEBHOOK_VERIFICATION_KEY/);
    expect(sent).toEqual([]);
  });

  it("refuses rather than pretends for shops that market through Klaviyo", async () => {
    const sent = mockSendGrid();
    await prisma.emailSettings.create({
      data: { shop: SHOP, senderName: "Shop", senderEmail: "shop@example.test", emailProvider: "KLAVIYO", klaviyoEnabled: true, klaviyoApiKey: "pk" },
    });
    const yes = await customer("yes@example.test", { acceptsMarketing: true });

    const result = await sendMarketingEmail(SHOP, [{ customerId: yes.id }], { subject: "Sale", html: "<p>Hi</p>" });

    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(sent).toEqual([]);
  });

  it("campaigns go through the same consent check", async () => {
    const sent = mockSendGrid();
    const yes = await customer("yes@example.test", { acceptsMarketing: true });
    const no = await customer("no@example.test");
    const template = await prisma.emailTemplate.create({
      data: { shop: SHOP, name: "Sale", type: "promotional", subject: "Sale", content: {}, htmlContent: "<p>Sale<script>x()</script></p>" },
    });
    const campaign = await prisma.emailCampaign.create({
      data: { shop: SHOP, name: "Sale", subject: "Sale", templateId: template.id, status: "draft", segmentRules: {} },
    });

    const result = await sendCampaignEmails(SHOP, campaign.id, [{ customerId: yes.id }, { customerId: no.id }]);

    expect(result).toMatchObject({ sent: 1, skipped: 1, failed: 0 });
    expect(sent[0].personalizations.map((p) => p.to[0].email)).toEqual([yes.email]);
    expect(sent[0].content.find((c) => c.type === "text/html")!.value).not.toContain("<script>");
  });

  it("unsubscribes by link (GET) and by one-click POST, and rejects forged tokens", async () => {
    const shopper = await customer("shopper@example.test", { acceptsMarketing: true });
    const link = await unsubscribeLinkFor(shopper.id);

    const page = await unsubscribeGet({ request: unsubscribeRequest(link), params: {}, context: {} });
    expect(page.status).toBe(200);
    await expect(page.text()).resolves.toContain("Card &amp; Co &lt;Shop&gt;");
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: shopper.id } });
    expect(after.acceptsMarketing).toBe(false);
    expect(after.marketingConsentUpdatedAt).toBeInstanceOf(Date);

    await prisma.customer.update({ where: { id: shopper.id }, data: { acceptsMarketing: true } });
    const oneClick = await unsubscribePost({
      request: unsubscribeRequest(link, { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "Content-Type": "application/x-www-form-urlencoded" } }),
      params: {},
      context: {},
    });
    expect(oneClick.status).toBe(200);
    await expect(prisma.customer.findUniqueOrThrow({ where: { id: shopper.id } })).resolves.toMatchObject({ acceptsMarketing: false });

    const forged = link.replace(/token=[^&]+/, "token=abc.def");
    expect((await unsubscribeGet({ request: unsubscribeRequest(forged), params: {}, context: {} })).status).toBe(400);
  });

  describe("consent from Shopify", () => {
    beforeEach(async () => {
      await seedOfflineSession(SHOP);
    });

    const payload = (state: string | null, consentUpdatedAt: string | null) => ({
      id: 4242,
      email: "webhook@example.test",
      first_name: "Web",
      last_name: "Hook",
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-02T10:00:00Z",
      ...(state ? { email_marketing_consent: { state, opt_in_level: "single_opt_in", consent_updated_at: consentUpdatedAt } } : {}),
    });
    const deliver = (handler: typeof customersUpdate, topic: string, body: unknown) =>
      handler({ request: signedWebhook(topic, SHOP, body), params: {}, context: {} });
    const stored = () => prisma.customer.findFirstOrThrow({ where: { shop: SHOP, shopifyCustomerId: "4242" } });

    it("subscribes on SUBSCRIBED only, and follows later changes", async () => {
      expect((await deliver(customersCreate, "customers/create", payload("pending", "2026-10-01T10:00:00Z"))).status).toBe(200);
      expect((await stored()).acceptsMarketing).toBe(false);

      expect((await deliver(customersUpdate, "customers/update", payload("subscribed", "2026-10-02T10:00:00Z"))).status).toBe(200);
      expect((await stored()).acceptsMarketing).toBe(true);

      expect((await deliver(customersUpdate, "customers/update", payload("unsubscribed", "2026-10-03T10:00:00Z"))).status).toBe(200);
      expect((await stored()).acceptsMarketing).toBe(false);
    });

    it("keeps an unsubscribe made here when Shopify still reports an older subscription", async () => {
      await deliver(customersCreate, "customers/create", payload("subscribed", "2026-10-02T10:00:00Z"));
      const shopper = await stored();
      await unsubscribeGet({ request: unsubscribeRequest(await unsubscribeLinkFor(shopper.id)), params: {}, context: {} });

      await deliver(customersUpdate, "customers/update", payload("subscribed", "2026-10-02T10:00:00Z"));
      expect((await stored()).acceptsMarketing).toBe(false);

      // Subscribing again in Shopify, later, is a new decision
      await deliver(customersUpdate, "customers/update", payload("subscribed", new Date(Date.now() + 60_000).toISOString()));
      expect((await stored()).acceptsMarketing).toBe(true);
    });

    it("treats a payload without consent as no consent", async () => {
      await deliver(customersCreate, "customers/create", payload(null, null));
      expect((await stored()).acceptsMarketing).toBe(false);
    });

    it("customer sync reads SUBSCRIBED consent and never invents an email address", async () => {
      const admin = {
        graphql: async () =>
          Response.json({
            data: {
              customers: {
                edges: [
                  { cursor: "a", node: { id: "gid://shopify/Customer/1", email: "sub@example.test", displayName: "Sub", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", emailMarketingConsent: { marketingState: "SUBSCRIBED", consentUpdatedAt: "2026-10-01T00:00:00Z" } } },
                  { cursor: "b", node: { id: "gid://shopify/Customer/2", email: "pending@example.test", displayName: "Pending", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", emailMarketingConsent: { marketingState: "PENDING", consentUpdatedAt: null } } },
                  { cursor: "c", node: { id: "gid://shopify/Customer/3", email: null, displayName: "No Email", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", emailMarketingConsent: null } },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          }),
      };

      await syncCustomersInBackground(SHOP, admin);

      const rows = await prisma.customer.findMany({ where: { shop: SHOP }, orderBy: { shopifyCustomerId: "asc" } });
      expect(rows.map((r) => [r.shopifyCustomerId, r.email, r.acceptsMarketing])).toEqual([
        ["1", "sub@example.test", true],
        ["2", "pending@example.test", false],
        ["3", "", false],
      ]);
    });
  });
});

async function unsubscribeLinkFor(customerId: string): Promise<string> {
  const { unsubscribeUrl } = await import("~/services/marketing-consent.server");
  return unsubscribeUrl(SHOP, customerId);
}
