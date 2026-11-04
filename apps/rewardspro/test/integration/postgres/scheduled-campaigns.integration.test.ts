import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The merchant's admin session is injected; everything below it is real.
vi.mock("~/shopify.server", () => ({
  authenticate: { admin: vi.fn(async () => ({ session: { shop: "campaigns-test.myshopify.com" } })) },
}));

import prisma from "~/db.server";
import { loader as cron } from "~/routes/api.cron.scheduled-campaigns";
import { action as createAction } from "~/routes/app.marketing.campaigns.create";
import { action as sendAction } from "~/routes/app.marketing.campaigns.$id.send";
import { sendCampaign } from "~/services/campaign-send.server";
import { server } from "../../mocks/server";
import { hasTestDatabase, resetDatabase } from "./database";

const SHOP = "campaigns-test.myshopify.com";
const CRON_SECRET = "cron-secret-for-tests";
const HOUR = 60 * 60 * 1000;

/** SendGrid's mail/send, answered by MSW; returns the recipients of each request. */
function mockSendGrid(): string[][] {
  const sent: string[][] = [];
  server.use(
    http.post("https://api.sendgrid.com/v3/mail/send", async ({ request }) => {
      const body = (await request.json()) as { personalizations: Array<{ to: Array<{ email: string }> }> };
      sent.push(body.personalizations.flatMap((p) => p.to.map((t) => t.email)).sort());
      return new HttpResponse(null, { status: 202 });
    }),
  );
  return sent;
}

function runCron() {
  return cron({
    request: new Request("https://test.example.com/api/cron/scheduled-campaigns", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    }),
    params: {},
    context: {},
  });
}

function post(url: string, fields: Record<string, string | string[]>) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) body.append(name, v);
  }
  return new Request(url, { method: "POST", body });
}

function create(fields: Record<string, string>) {
  return createAction({
    request: post("https://test.example.com/app/marketing/campaigns/create", {
      campaignName: "Autumn sale",
      contentMode: "inline",
      inlineSubject: "Autumn sale",
      inlineContent: "<p>20% off this weekend</p>",
      ...fields,
    }),
    params: {},
    context: {},
  });
}

function send(id: string, fields: Record<string, string | string[]>) {
  return sendAction({
    request: post(`https://test.example.com/app/marketing/campaigns/${id}/send`, fields),
    params: { id },
    context: {},
  });
}

/** The date `days` from today in New York, as the date picker posts it. */
function nyDate(days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + days * 24 * HOUR));
}

let bronze: { id: string };
let gold: { id: string };
let templateId: string;
const emails = { bronzeYes: "bronze-yes@example.test", bronzeNo: "bronze-no@example.test", goldYes: "gold-yes@example.test" };

async function campaign(data: { status: string; segmentRules: object; scheduledFor?: Date; name?: string }) {
  return prisma.emailCampaign.create({
    data: { shop: SHOP, name: data.name ?? "Sale", subject: "Sale", templateId, ...data },
  });
}

describe.skipIf(!hasTestDatabase)("scheduled campaigns on Postgres", () => {
  const env = { ...process.env };

  beforeEach(async () => {
    await resetDatabase();
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.SENDGRID_API_KEY = "SG.test";
    process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY = "test-verification-key";
    for (const method of ["log", "info", "warn"] as const) vi.spyOn(console, method).mockImplementation(() => {});

    await prisma.shopSettings.create({
      data: { shop: SHOP, storeName: "Card Shop", storeUrl: `https://${SHOP}`, timezone: "America/New_York" },
    });
    bronze = await prisma.tier.create({ data: { id: "tier-bronze", shop: SHOP, name: "Bronze", minSpend: 0, cashbackPercent: 5 } });
    gold = await prisma.tier.create({ data: { id: "tier-gold", shop: SHOP, name: "Gold", minSpend: 500, cashbackPercent: 10 } });
    let n = 0;
    const customer = (email: string, tierId: string, acceptsMarketing: boolean) =>
      prisma.customer.create({ data: { shop: SHOP, shopifyCustomerId: String(++n), email, currentTierId: tierId, acceptsMarketing } });
    await customer(emails.bronzeYes, bronze.id, true);
    await customer(emails.bronzeNo, bronze.id, false);
    await customer(emails.goldYes, gold.id, true);
    templateId = (
      await prisma.emailTemplate.create({
        data: { shop: SHOP, name: "Sale", type: "promotional", subject: "Sale", content: {}, htmlContent: "<p>Sale</p>" },
      })
    ).id;
  });

  afterEach(() => {
    process.env = { ...env };
  });

  describe("who gets a campaign", () => {
    it("sends a campaign the Create page schedules for one tier only to that tier's customers who agreed to marketing", async () => {
      const sent = mockSendGrid();
      const response = await create({ segmentId: bronze.id, scheduleType: "scheduled", scheduledDate: nyDate(1), scheduledTime: "09:00" });
      expect(response.status).toBe(302);
      const scheduled = await prisma.emailCampaign.findFirstOrThrow({ where: { shop: SHOP } });
      expect(scheduled.status).toBe("scheduled");
      expect(scheduled.segmentRules).toEqual({ tierIds: [bronze.id] });

      await prisma.emailCampaign.update({ where: { id: scheduled.id }, data: { scheduledFor: new Date(Date.now() - 60_000) } });
      expect((await runCron()).status).toBe(200);

      expect(sent).toEqual([[emails.bronzeYes]]);
      expect(await prisma.emailCampaign.findUniqueOrThrow({ where: { id: scheduled.id } })).toMatchObject({ status: "sent" });
    });

    it("keeps the audience chosen on the send page when the campaign is scheduled there", async () => {
      const sent = mockSendGrid();
      const draft = await campaign({ status: "draft", segmentRules: { allCustomers: true } });

      const response = await send(draft.id, {
        intent: "schedule",
        sendToAll: "false",
        sendToRecommended: "false",
        selectedTiers: [gold.id],
        scheduledDate: nyDate(1),
        scheduledTime: "09:00",
      });
      expect(response.status).toBe(302);
      const scheduled = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: draft.id } });
      expect(scheduled).toMatchObject({ status: "scheduled", segmentRules: { tierIds: [gold.id] } });

      await prisma.emailCampaign.update({ where: { id: draft.id }, data: { scheduledFor: new Date(Date.now() - 60_000) } });
      await runCron();

      expect(sent).toEqual([[emails.goldYes]]);
    });

    it("sends 'All customers' to everyone who agreed to marketing, including campaigns saved before this change", async () => {
      const sent = mockSendGrid();
      await create({ segmentId: "all", scheduleType: "scheduled", scheduledDate: nyDate(1), scheduledTime: "09:00" });
      const fromCreate = await prisma.emailCampaign.findFirstOrThrow({ where: { shop: SHOP } });
      expect(fromCreate.segmentRules).toEqual({ allCustomers: true });
      await prisma.emailCampaign.update({ where: { id: fromCreate.id }, data: { scheduledFor: new Date(Date.now() - 2 * 60_000) } });
      // The Create page used to save its "All Customers" choice like this
      await campaign({ status: "scheduled", segmentRules: { tierIds: ["all"] }, scheduledFor: new Date(Date.now() - 60_000) });

      await runCron();

      expect(sent).toEqual([
        [emails.bronzeYes, emails.goldYes],
        [emails.bronzeYes, emails.goldYes],
      ]);
    });

    it("sends nothing, and says why, when it can't tell who a campaign is for", async () => {
      const sent = mockSendGrid();
      const due = new Date(Date.now() - 60_000);
      const empty = await campaign({ status: "scheduled", segmentRules: {}, scheduledFor: due });
      const noCustomers = await campaign({
        status: "scheduled",
        segmentRules: { fromRecommendation: true, targetCustomerIds: [] },
        scheduledFor: due,
      });

      await runCron();

      expect(sent).toEqual([]);
      for (const { id } of [empty, noCustomers]) {
        const after = await prisma.emailCampaign.findUniqueOrThrow({ where: { id } });
        expect(after.status).toBe("failed");
        expect((after.metrics as { notSentReason?: string }).notSentReason).toMatch(/couldn't tell who this campaign is for/);
      }
    });
  });

  describe("when a campaign goes out", () => {
    it("holds back a campaign more than a day late, says why, and still sends one that is less late", async () => {
      const sent = mockSendGrid();
      const stale = await campaign({ status: "scheduled", segmentRules: { allCustomers: true }, scheduledFor: new Date(Date.now() - 25 * HOUR), name: "Stale" });
      const late = await campaign({ status: "scheduled", segmentRules: { tierIds: [gold.id] }, scheduledFor: new Date(Date.now() - 23 * HOUR), name: "Late" });

      const body = await (await runCron()).json();

      expect(sent).toEqual([[emails.goldYes]]);
      const held = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: stale.id } });
      expect(held.status).toBe("missed");
      expect((held.metrics as { notSentReason?: string }).notSentReason).toMatch(/more than 24 hours/);
      expect(await prisma.emailCampaign.findUniqueOrThrow({ where: { id: late.id } })).toMatchObject({ status: "sent" });
      expect(body.summary).toMatchObject({ sent: 1, missed: 1 });
    });

    it("reads the chosen date and time in the shop's time zone", async () => {
      await create({ segmentId: "all", scheduleType: "scheduled", scheduledDate: "2099-12-01", scheduledTime: "09:00" });
      const fromCreate = await prisma.emailCampaign.findFirstOrThrow({ where: { shop: SHOP } });
      // 9:00 AM in New York in December is 14:00 UTC
      expect(fromCreate.scheduledFor?.toISOString()).toBe("2099-12-01T14:00:00.000Z");

      const draft = await campaign({ status: "draft", segmentRules: { allCustomers: true } });
      await send(draft.id, { intent: "schedule", sendToAll: "true", sendToRecommended: "false", scheduledDate: "2099-07-01", scheduledTime: "09:00" });
      // and 13:00 UTC in July (daylight saving time)
      expect((await prisma.emailCampaign.findUniqueOrThrow({ where: { id: draft.id } })).scheduledFor?.toISOString()).toBe(
        "2099-07-01T13:00:00.000Z",
      );
    });

    it("refuses a time that has already passed", async () => {
      const draft = await campaign({ status: "draft", segmentRules: { allCustomers: true } });
      const response = await send(draft.id, { intent: "schedule", sendToAll: "true", sendToRecommended: "false", scheduledDate: nyDate(-1), scheduledTime: "09:00" });

      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/future/);
      expect(await prisma.emailCampaign.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "draft", scheduledFor: null });
    });

    it("sends at most 10 campaigns a run, oldest first, and the rest on the next run", async () => {
      const sent = mockSendGrid();
      for (let i = 12; i >= 1; i--) {
        await campaign({ status: "scheduled", segmentRules: { allCustomers: true }, scheduledFor: new Date(Date.now() - i * 60_000), name: `Campaign ${i}` });
      }

      await runCron();
      expect(sent).toHaveLength(10);
      const waiting = await prisma.emailCampaign.findMany({ where: { shop: SHOP, status: "scheduled" }, select: { name: true } });
      expect(waiting.map((c) => c.name).sort()).toEqual(["Campaign 1", "Campaign 2"]);

      await runCron();
      expect(sent).toHaveLength(12);
    });
  });

  describe("a campaign goes out once", () => {
    it("sends once when Send now is pressed twice", async () => {
      const sent = mockSendGrid();
      const draft = await campaign({ status: "draft", segmentRules: { allCustomers: true } });
      const press = () => send(draft.id, { intent: "send_now", sendToAll: "true", sendToRecommended: "false" });

      const responses = await Promise.all([press(), press()]);

      expect(sent).toHaveLength(1);
      expect(responses.map((r) => r.status).sort()).toEqual([302, 409]);
      expect(await prisma.emailCampaign.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "sent" });
    });

    it("sends a scheduled campaign once when two sends of it race", async () => {
      const sent = mockSendGrid();
      const scheduled = await campaign({ status: "scheduled", segmentRules: { allCustomers: true }, scheduledFor: new Date(Date.now() - 60_000) });

      const outcomes = await Promise.all([sendCampaign(SHOP, scheduled.id, "scheduled"), sendCampaign(SHOP, scheduled.id, "scheduled")]);

      expect(sent).toHaveLength(1);
      expect(outcomes.map((o) => o.status).sort()).toEqual(["sent", "taken"]);
    });

    it("sends once when Send now, pressed on a page opened before the campaign was scheduled, meets the cron", async () => {
      const sent = mockSendGrid();
      const scheduled = await campaign({ status: "scheduled", segmentRules: { allCustomers: true }, scheduledFor: new Date(Date.now() - 60_000) });

      const [, pressed] = await Promise.all([
        runCron(),
        send(scheduled.id, { intent: "send_now", sendToAll: "true", sendToRecommended: "false" }),
      ]);

      expect(sent).toHaveLength(1);
      expect(pressed.status).toBe(409);
    });
  });

  describe("the shop's monthly email limit", () => {
    async function nearlyUsedUp() {
      const now = new Date();
      await prisma.monthlyEmailUsage.create({
        data: { shop: SHOP, year: now.getFullYear(), month: now.getMonth() + 1, emailCount: 999, planLimit: 1000, planName: "Free" },
      });
    }

    it("stops a scheduled campaign that would go past it, and says why", async () => {
      const sent = mockSendGrid();
      await nearlyUsedUp();
      const due = await campaign({ status: "scheduled", segmentRules: { allCustomers: true }, scheduledFor: new Date(Date.now() - 60_000) });

      await runCron();

      expect(sent).toEqual([]);
      const after = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: due.id } });
      expect(after.status).toBe("failed");
      expect((after.metrics as { notSentReason?: string }).notSentReason).toMatch(/1 of its 1,000 emails left this month/);
    });

    it("stops Send now too, keeping the draft", async () => {
      const sent = mockSendGrid();
      await nearlyUsedUp();
      const draft = await campaign({ status: "draft", segmentRules: { allCustomers: true } });

      const response = await send(draft.id, { intent: "send_now", sendToAll: "true", sendToRecommended: "false" });

      expect(sent).toEqual([]);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/1 of its 1,000 emails left this month/);
      expect(await prisma.emailCampaign.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "draft" });
    });
  });

  describe("the Create page's Send immediately", () => {
    it("sends the campaign to the chosen tier", async () => {
      const sent = mockSendGrid();

      const response = await create({ segmentId: bronze.id, scheduleType: "immediate" });

      expect(response.status).toBe(302);
      expect(sent).toEqual([[emails.bronzeYes]]);
      const created = await prisma.emailCampaign.findFirstOrThrow({ where: { shop: SHOP } });
      expect(created).toMatchObject({ status: "sent", metrics: expect.objectContaining({ sent: 1 }) });
    });

    it("creates nothing while marketing email is off, and says why", async () => {
      const sent = mockSendGrid();
      delete process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;

      for (const fields of [
        { segmentId: "all", scheduleType: "immediate" },
        { segmentId: "all", scheduleType: "scheduled", scheduledDate: nyDate(1), scheduledTime: "09:00" },
      ]) {
        const response = await create(fields);
        expect(response.status).toBe(409);
        expect((await response.json()).error).toMatch(/Marketing email is off/);
      }

      expect(sent).toEqual([]);
      expect(await prisma.emailCampaign.count({ where: { shop: SHOP } })).toBe(0);
    });
  });
});
