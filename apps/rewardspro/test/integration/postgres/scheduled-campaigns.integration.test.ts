import { delay, http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The merchant's admin session is injected; everything below it is real.
vi.mock("~/shopify.server", () => ({
  authenticate: { admin: vi.fn(async () => ({ session: { shop: "campaigns-test.myshopify.com" } })) },
}));

import prisma from "~/db.server";
import { loader as cron } from "~/routes/api.cron.scheduled-campaigns";
import { action as createAction, loader as createLoader } from "~/routes/app.marketing.campaigns.create";
import { action as sendAction, loader as sendLoader } from "~/routes/app.marketing.campaigns.$id.send";
import { action as smartCreateAction } from "~/routes/app.marketing.campaigns.smart-create";
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
      // A fresh Create page each time, unless a test posts one page twice
      createKey: crypto.randomUUID(),
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

/** SendGrid's mail/send refusing every request, as it does for a revoked key. */
function sendGridRefuses(): { requests: number } {
  const calls = { requests: 0 };
  server.use(
    http.post("https://api.sendgrid.com/v3/mail/send", () => {
      calls.requests++;
      return HttpResponse.json(
        { errors: [{ message: "The provided authorization grant is invalid, expired, or revoked" }] },
        { status: 401 },
      );
    }),
  );
  return calls;
}

/** SendGrid's mail/send dropping the connection before it answers, so no one knows whether it sent the mail. */
function sendGridGivesNoAnswer(): { requests: number } {
  const calls = { requests: 0 };
  server.use(
    http.post("https://api.sendgrid.com/v3/mail/send", () => {
      calls.requests++;
      return HttpResponse.error();
    }),
  );
  return calls;
}

/**
 * SendGrid's mail/send answering with a server error. A 5xx doesn't show the
 * mail wasn't sent: a 500 can come after SendGrid accepted it, and a 502 or
 * 504 is its edge saying its servers didn't answer in time.
 */
function sendGridServerError(status: number): { requests: number } {
  const calls = { requests: 0 };
  server.use(
    http.post("https://api.sendgrid.com/v3/mail/send", () => {
      calls.requests++;
      return HttpResponse.json({ errors: [{ message: "Upstream request timeout" }] }, { status });
    }),
  );
  return calls;
}

/** SendGrid's mail/send never answering at all. */
function sendGridHangs(): { requests: number } {
  const calls = { requests: 0 };
  server.use(
    http.post("https://api.sendgrid.com/v3/mail/send", async () => {
      calls.requests++;
      await delay("infinite");
      return new HttpResponse(null, { status: 202 });
    }),
  );
  return calls;
}

/** This month's email usage for the shop, as recorded so far. */
async function usage(emailCount: number) {
  const now = new Date();
  await prisma.monthlyEmailUsage.create({
    data: { shop: SHOP, year: now.getFullYear(), month: now.getMonth() + 1, emailCount, planLimit: 1000, planName: "Free" },
  });
}

async function emailsUsed(): Promise<number> {
  return (await prisma.monthlyEmailUsage.findFirst({ where: { shop: SHOP } }))?.emailCount ?? 0;
}

const restores: Array<() => void> = [];

/**
 * Swap one of Prisma's model methods for the rest of this test. (vi.spyOn
 * can't be used: restoring it leaves the method undefined on the client
 * every later suite shares.)
 */
function swap<M extends object, K extends keyof M>(model: M, method: K, replacement: (original: M[K]) => M[K]) {
  const original = model[method];
  model[method] = replacement((original as (...args: unknown[]) => unknown).bind(model) as M[K]);
  restores.push(() => {
    model[method] = original;
  });
}

const dropped = () => Promise.reject(new Error("Connection terminated unexpectedly"));

/** Makes the campaign's final "sent" write fail once, after the email service has it. */
function failTheSentWriteOnce() {
  let failed = false;
  swap(prisma.emailCampaign, "updateMany", (updateMany) =>
    ((args: Parameters<typeof updateMany>[0]) => {
      if (failed || (args.data as { status?: string }).status !== "sent") return updateMany(args);
      failed = true;
      return dropped();
    }) as typeof updateMany,
  );
}

function smartCreate(fields: Record<string, string>) {
  return smartCreateAction({
    request: post("https://test.example.com/app/marketing/campaigns/smart-create", {
      action: "create_campaign",
      name: "Win back",
      subject: "We miss you",
      bodyHtml: "<p>Come back for 10% off</p>",
      ...fields,
    }),
    params: {},
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
    while (restores.length > 0) restores.pop()!();
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
        expect(after.sentAt).toBeNull();
      }
    });

    it("marks a scheduled campaign that reaches no one as not sent, and says why", async () => {
      const sent = mockSendGrid();
      const silver = await prisma.tier.create({ data: { id: "tier-silver", shop: SHOP, name: "Silver", minSpend: 200, cashbackPercent: 7 } });
      await prisma.customer.create({ data: { shop: SHOP, shopifyCustomerId: "silver-no", email: "silver-no@example.test", currentTierId: silver.id, acceptsMarketing: false } });
      const due = await campaign({ status: "scheduled", segmentRules: { tierIds: [silver.id] }, scheduledFor: new Date(Date.now() - 60_000) });

      await runCron();

      expect(sent).toEqual([]);
      const after = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: due.id } });
      expect(after.status).toBe("failed");
      expect(after.sentAt).toBeNull();
      expect((after.metrics as { notSentReason?: string }).notSentReason).toMatch(
        /no one in its audience could get marketing email \(the audience was empty, or no one in it had agreed to marketing email\)/,
      );
    });

    it("refuses Send now to a tier where no one agreed to marketing, and keeps the draft", async () => {
      const sent = mockSendGrid();
      const silver = await prisma.tier.create({ data: { id: "tier-silver", shop: SHOP, name: "Silver", minSpend: 200, cashbackPercent: 7 } });
      const draft = await campaign({ status: "draft", segmentRules: { tierIds: [silver.id] } });

      const response = await send(draft.id, { intent: "send_now", sendToAll: "false", sendToRecommended: "false", selectedTiers: [silver.id] });

      expect(response.status).toBe(400);
      expect(sent).toEqual([]);
      expect(await prisma.emailCampaign.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "draft", sentAt: null });
    });

    it("opens the send page on the audience saved on the campaign", async () => {
      const draft = await campaign({ status: "draft", segmentRules: { tierIds: [bronze.id] } });

      const response = await sendLoader({
        request: new Request(`https://test.example.com/app/marketing/campaigns/${draft.id}/send`),
        params: { id: draft.id },
        context: {},
      });

      expect((await response.json()).audience).toEqual({ kind: "tiers", tierIds: [bronze.id] });
    });

    it("puts the saved audience back when a Send now doesn't go out", async () => {
      mockSendGrid();
      await usage(999);
      const fromRecommendation = { fromRecommendation: true, recommendationType: "inactive_customers", targetCustomerIds: ["c1", "c2"] };
      const draft = await campaign({ status: "draft", segmentRules: fromRecommendation });

      const response = await send(draft.id, { intent: "send_now", sendToAll: "true", sendToRecommended: "false" });

      expect(response.status).toBe(400);
      expect(await prisma.emailCampaign.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({
        status: "draft",
        segmentRules: fromRecommendation,
      });
    });

    it("sends a campaign whose template keeps its email in bodyHtml, with the template's subject", async () => {
      const mails: Array<{ subject: string; html: string }> = [];
      server.use(
        http.post("https://api.sendgrid.com/v3/mail/send", async ({ request }) => {
          const body = (await request.json()) as { subject: string; content: Array<{ type: string; value: string }> };
          mails.push({ subject: body.subject, html: body.content.find((c) => c.type === "text/html")!.value });
          return new HttpResponse(null, { status: 202 });
        }),
      );
      // Smart Create and applying a recommendation save templates like this
      const template = await prisma.emailTemplate.create({
        data: { shop: SHOP, name: "Win back", type: "promotional", subject: "We miss you", content: {}, bodyHtml: "<p>Come back</p>" },
      });
      const draft = await prisma.emailCampaign.create({
        data: { shop: SHOP, name: "Win back", templateId: template.id, status: "draft", segmentRules: { allCustomers: true } },
      });

      const response = await send(draft.id, { intent: "send_now", sendToAll: "true", sendToRecommended: "false" });

      expect(response.status).toBe(302);
      expect(mails).toHaveLength(1);
      expect(mails[0].subject).toBe("We miss you");
      expect(mails[0].html).toContain("<p>Come back</p>");
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

    it("refuses a time that has already passed on the Create page too, and creates nothing", async () => {
      const response = await create({ segmentId: "all", scheduleType: "scheduled", scheduledDate: nyDate(-1), scheduledTime: "09:00" });

      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/future/);
      expect(await prisma.emailCampaign.count({ where: { shop: SHOP } })).toBe(0);
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

    it("sends once when the Create page's Launch Campaign is pressed twice", async () => {
      // The first press is still waiting for SendGrid when the second arrives
      const requests: string[][] = [];
      let arrived!: () => void;
      const firstArrived = new Promise<void>((resolve) => (arrived = resolve));
      let answer!: () => void;
      const answered = new Promise<void>((resolve) => (answer = resolve));
      server.use(
        http.post("https://api.sendgrid.com/v3/mail/send", async ({ request }) => {
          const body = (await request.json()) as { personalizations: Array<{ to: Array<{ email: string }> }> };
          requests.push(body.personalizations.flatMap((p) => p.to.map((t) => t.email)).sort());
          if (requests.length === 1) {
            arrived();
            await answered;
          }
          return new HttpResponse(null, { status: 202 });
        }),
      );
      await usage(10);
      const createKey = crypto.randomUUID();
      const press = () => create({ segmentId: "all", scheduleType: "immediate", createKey });

      const first = press();
      await firstArrived;
      const second = await press();
      answer();
      const responses = [await first, second];

      expect(requests).toEqual([[emails.bronzeYes, emails.goldYes]]);
      for (const response of responses) {
        expect(response.status).toBe(302);
        expect(response.headers.get("Location")).toBe(`/app/marketing/campaigns/${createKey}`);
      }
      expect(await prisma.emailCampaign.findMany({ where: { shop: SHOP }, select: { id: true, status: true } })).toEqual([
        { id: createKey, status: "sent" },
      ]);
      // and the second press leaves no copy of the email behind among the templates
      expect(await prisma.emailTemplate.count({ where: { shop: SHOP, name: "Campaign: Autumn sale" } })).toBe(1);
      expect(await emailsUsed()).toBe(12);
    });

    it("takes a second Save Draft or Schedule from the same Create page to the campaign it already made", async () => {
      const createKey = crypto.randomUUID();
      for (const fields of [
        { segmentId: "all", scheduleType: "draft", createKey },
        { segmentId: "all", scheduleType: "scheduled", scheduledDate: nyDate(1), scheduledTime: "09:00", createKey },
      ]) {
        await prisma.emailCampaign.deleteMany({ where: { shop: SHOP } });
        const first = await create(fields);
        const second = await create(fields);
        for (const response of [first, second]) {
          expect(response.status).toBe(302);
          expect(response.headers.get("Location")).toBe(`/app/marketing/campaigns/${createKey}`);
        }
        expect(await prisma.emailCampaign.count({ where: { shop: SHOP } })).toBe(1);
      }
    });

    it("refuses a Create that doesn't come from the page, and creates nothing", async () => {
      const sent = mockSendGrid();

      for (const createKey of ["", "not-a-key"]) {
        const response = await create({ segmentId: "all", scheduleType: "immediate", createKey });
        expect(response.status).toBe(400);
        expect((await response.json()).error).toMatch(/Reload the page/);
      }

      expect(sent).toEqual([]);
      expect(await prisma.emailCampaign.count({ where: { shop: SHOP } })).toBe(0);
      expect(await prisma.emailTemplate.count({ where: { shop: SHOP } })).toBe(1);
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

    it("doesn't put a campaign back to draft once the email service has it, so Send now can't send it twice", async () => {
      const sent = mockSendGrid();
      const draft = await campaign({ status: "draft", segmentRules: { allCustomers: true } });
      failTheSentWriteOnce();
      const press = () => send(draft.id, { intent: "send_now", sendToAll: "true", sendToRecommended: "false" });

      const first = await press();

      expect(first.status).toBe(500);
      expect((await first.json()).error).not.toMatch(/Connection terminated/);
      const after = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: draft.id } });
      expect(after.status).toBe("failed");
      expect((after.metrics as { interruptedReason?: string }).interruptedReason).toMatch(/may have received it/);

      const second = await press();
      expect(second.status).toBe(409);
      expect(sent).toHaveLength(1);
    });

    it("says what is known when a scheduled send goes wrong after the email service has it", async () => {
      mockSendGrid();
      const due = await campaign({ status: "scheduled", segmentRules: { allCustomers: true }, scheduledFor: new Date(Date.now() - 60_000) });
      failTheSentWriteOnce();

      await runCron();

      const after = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: due.id } });
      expect(after.status).toBe("failed");
      expect((after.metrics as { interruptedReason?: string }).interruptedReason).toMatch(/may have received it/);
    });

    it("says nothing went out when a scheduled send goes wrong before the email service has it", async () => {
      const sent = mockSendGrid();
      const due = await campaign({ status: "scheduled", segmentRules: { allCustomers: true }, scheduledFor: new Date(Date.now() - 60_000) });
      let calls = 0;
      swap(prisma.customer, "findMany", (findMany) => ((args) => (calls++ === 0 ? dropped() : findMany(args))) as typeof findMany);

      await runCron();

      expect(sent).toEqual([]);
      const after = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: due.id } });
      expect(after.status).toBe("failed");
      expect(after.sentAt).toBeNull();
      expect((after.metrics as { notSentReason?: string }).notSentReason).toMatch(/nothing went out/);
    });

    it("says nothing went out when reading the campaign's email fails before the email service has it", async () => {
      const sent = mockSendGrid();
      const due = await campaign({ status: "scheduled", segmentRules: { allCustomers: true }, scheduledFor: new Date(Date.now() - 60_000) });
      swap(prisma.emailCampaign, "findFirst", (findFirst) => (() => dropped()) as unknown as typeof findFirst);

      await runCron();

      expect(sent).toEqual([]);
      const after = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: due.id } });
      expect(after.status).toBe("failed");
      expect(after.sentAt).toBeNull();
      expect((after.metrics as { notSentReason?: string }).notSentReason).toMatch(/nothing went out/);
      expect(after.metrics).not.toHaveProperty("interruptedReason");
    });

    it("keeps the draft and gives the emails back when the store's name can't be read", async () => {
      const sent = mockSendGrid();
      await usage(10);
      const draft = await campaign({ status: "draft", segmentRules: { allCustomers: true } });
      swap(prisma.shopSettings, "findUnique", (findUnique) =>
        ((args: Parameters<typeof findUnique>[0]) =>
          (args.select as { storeName?: boolean } | undefined)?.storeName ? dropped() : findUnique(args)) as typeof findUnique,
      );

      const response = await send(draft.id, { intent: "send_now", sendToAll: "true", sendToRecommended: "false" });

      expect(sent).toEqual([]);
      expect((await response.json()).error).not.toMatch(/may have/);
      expect(await prisma.emailCampaign.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "draft", sentAt: null });
      expect(await emailsUsed()).toBe(10);
    });

    it("doesn't let Schedule overwrite a campaign that stopped being a draft after the page read it", async () => {
      const scheduledFor = new Date(Date.now() + 2 * HOUR);
      const taken = await campaign({ status: "scheduled", segmentRules: { allCustomers: true }, scheduledFor });
      // The page's read still sees a draft; the row has moved on by the time of the write
      let reads = 0;
      swap(prisma.emailCampaign, "findFirst", (findFirst) =>
        ((args) => (reads++ === 0 ? Promise.resolve({ segmentRules: { allCustomers: true } }) : findFirst(args))) as typeof findFirst,
      );

      const response = await send(taken.id, {
        intent: "schedule",
        sendToAll: "false",
        sendToRecommended: "false",
        selectedTiers: [gold.id],
        scheduledDate: nyDate(3),
        scheduledTime: "09:00",
      });

      expect(response.status).toBe(409);
      expect(await prisma.emailCampaign.findUniqueOrThrow({ where: { id: taken.id } })).toMatchObject({
        status: "scheduled",
        scheduledFor,
        segmentRules: { allCustomers: true },
      });
    });
  });

  describe("when the email service refuses a campaign", () => {
    it("tells the merchant plainly, keeps the draft, and gives the emails back", async () => {
      const calls = sendGridRefuses();
      await usage(10);
      const draft = await campaign({ status: "draft", segmentRules: { allCustomers: true } });

      const response = await send(draft.id, { intent: "send_now", sendToAll: "true", sendToRecommended: "false" });

      expect(calls.requests).toBe(1);
      expect(response.status).toBe(400);
      const { error } = await response.json();
      expect(error).toMatch(/RewardsPro couldn't send this campaign/);
      expect(error).not.toMatch(/authorization grant/);
      expect(await prisma.emailCampaign.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "draft" });
      expect(await emailsUsed()).toBe(10);
    });

    it("marks a scheduled campaign failed with a plain reason, and the cron run answers 500", async () => {
      sendGridRefuses();
      const due = await campaign({ status: "scheduled", segmentRules: { allCustomers: true }, scheduledFor: new Date(Date.now() - 60_000) });

      const response = await runCron();

      expect(response.status).toBe(500);
      expect((await response.json()).summary).toMatchObject({ failed: 1 });
      const after = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: due.id } });
      expect(after.status).toBe("failed");
      expect(after.sentAt).toBeNull();
      const { notSentReason } = after.metrics as { notSentReason?: string };
      expect(notSentReason).toMatch(/RewardsPro couldn't send this campaign/);
      expect(notSentReason).not.toMatch(/authorization grant/);
    });
  });

  describe("when the email service gives no answer", () => {
    // The connection dropped, so SendGrid may have sent the mail before it went
    const mayHaveGoneOut = /some or all customers may have received it/;

    it("marks a Send now failed, says it may have gone out, keeps the emails counted, and won't send it again", async () => {
      const calls = sendGridGivesNoAnswer();
      await usage(10);
      const draft = await campaign({ status: "draft", segmentRules: { allCustomers: true } });
      const press = () => send(draft.id, { intent: "send_now", sendToAll: "true", sendToRecommended: "false" });

      const first = await press();

      expect(calls.requests).toBe(1);
      expect(first.status).toBe(500);
      const { error } = await first.json();
      expect(error).toMatch(mayHaveGoneOut);
      expect(error).toMatch(/before you send it again/);
      expect(error).not.toMatch(/Failed to fetch|Try again later/);
      const after = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: draft.id } });
      expect(after.status).toBe("failed");
      expect(after.metrics).toMatchObject({ interruptedReason: expect.stringMatching(mayHaveGoneOut) });
      expect(after.metrics).not.toHaveProperty("notSentReason");
      expect(await emailsUsed()).toBe(12);

      const second = await press();
      expect(second.status).toBe(409);
      expect(calls.requests).toBe(1);
    });

    it("marks a scheduled campaign failed without saying nothing was sent, fails the run, and doesn't send it again", async () => {
      const calls = sendGridGivesNoAnswer();
      const due = await campaign({ status: "scheduled", segmentRules: { allCustomers: true }, scheduledFor: new Date(Date.now() - 60_000) });

      const response = await runCron();

      expect(calls.requests).toBe(1);
      expect(response.status).toBe(500);
      expect((await response.json()).summary).toMatchObject({ sent: 0, failed: 1 });
      const after = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: due.id } });
      expect(after.status).toBe("failed");
      expect(after.metrics).toMatchObject({ interruptedReason: expect.stringMatching(mayHaveGoneOut) });
      expect(after.metrics).not.toHaveProperty("notSentReason");
      expect(JSON.stringify(after.metrics)).not.toMatch(/nothing was sent|Duplicate it to try again/);
      expect(await emailsUsed()).toBe(2);

      await runCron();
      expect(calls.requests).toBe(1);
    });

    it.each([500, 502, 503, 504])("treats a %i from SendGrid the same, and won't send it again", async (status) => {
      const calls = sendGridServerError(status);
      await usage(10);
      const draft = await campaign({ status: "draft", segmentRules: { allCustomers: true } });
      const press = () => send(draft.id, { intent: "send_now", sendToAll: "true", sendToRecommended: "false" });

      const first = await press();

      expect(first.status).toBe(500);
      const { error } = await first.json();
      expect(error).toMatch(mayHaveGoneOut);
      expect(error).not.toMatch(/Try again later|Upstream/);
      const after = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: draft.id } });
      expect(after.status).toBe("failed");
      expect(after.metrics).toMatchObject({ interruptedReason: expect.stringMatching(mayHaveGoneOut) });
      expect(after.metrics).not.toHaveProperty("notSentReason");
      expect(await emailsUsed()).toBe(12);

      const second = await press();
      expect(second.status).toBe(409);
      expect(calls.requests).toBe(1);
    });

    it("doesn't say nothing was sent when SendGrid's gateway times out on a scheduled campaign", async () => {
      const calls = sendGridServerError(504);
      const due = await campaign({ status: "scheduled", segmentRules: { allCustomers: true }, scheduledFor: new Date(Date.now() - 60_000) });

      const response = await runCron();

      expect(response.status).toBe(500);
      const after = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: due.id } });
      expect(after.status).toBe("failed");
      expect(after.metrics).toMatchObject({ interruptedReason: expect.stringMatching(mayHaveGoneOut) });
      expect(JSON.stringify(after.metrics)).not.toMatch(/nothing was sent|Duplicate it to try again/);

      await runCron();
      expect(calls.requests).toBe(1);
    });

    it("stops waiting for an answer after 20 seconds, says it may have gone out, and won't send it again", async () => {
      const calls = sendGridHangs();
      // Twenty seconds are made 50 ms here
      const timeout = AbortSignal.timeout.bind(AbortSignal);
      const waits: number[] = [];
      const spy = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
        waits.push(ms);
        return timeout(ms === 20_000 ? 50 : ms);
      });
      restores.push(() => spy.mockRestore());
      const draft = await campaign({ status: "draft", segmentRules: { allCustomers: true } });
      const press = () => send(draft.id, { intent: "send_now", sendToAll: "true", sendToRecommended: "false" });

      const first = await press();

      expect(waits).toContain(20_000);
      expect(first.status).toBe(500);
      expect((await first.json()).error).toMatch(mayHaveGoneOut);
      expect(await prisma.emailCampaign.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({
        status: "failed",
        metrics: expect.objectContaining({ interruptedReason: expect.stringMatching(mayHaveGoneOut) }),
      });

      expect((await press()).status).toBe(409);
      expect(calls.requests).toBe(1);
    });

    it("keeps what SendGrid reported about the campaign while RewardsPro waited for an answer", async () => {
      // SendGrid's event webhook counts deliveries on the campaign (webhooks.sendgrid.tsx)
      const reported = { sent: 0, delivered: 2, opened: 0, clicked: 0, bounced: 1, unsubscribed: 0, revenue: 0, orders: 0 };
      server.use(
        http.post("https://api.sendgrid.com/v3/mail/send", async () => {
          await prisma.emailCampaign.updateMany({ where: { shop: SHOP }, data: { metrics: reported } });
          return HttpResponse.error();
        }),
      );
      const draft = await campaign({ status: "draft", segmentRules: { allCustomers: true } });

      await send(draft.id, { intent: "send_now", sendToAll: "true", sendToRecommended: "false" });

      expect((await prisma.emailCampaign.findUniqueOrThrow({ where: { id: draft.id } })).metrics).toMatchObject({
        ...reported,
        interruptedReason: expect.stringMatching(mayHaveGoneOut),
      });
    });

    it("tells the Create page's Send immediately the same, and doesn't call it a draft", async () => {
      const calls = sendGridGivesNoAnswer();

      const response = await create({ segmentId: "all", scheduleType: "immediate" });

      expect(calls.requests).toBe(1);
      expect(response.status).toBe(500);
      const { error } = await response.json();
      expect(error).toMatch(mayHaveGoneOut);
      expect(error).not.toMatch(/saved as a draft/);
      expect(await prisma.emailCampaign.findFirstOrThrow({ where: { shop: SHOP } })).toMatchObject({ status: "failed" });
    });

    it("tells Smart Create's Send immediately the same, and doesn't call it a draft", async () => {
      const calls = sendGridGivesNoAnswer();
      const goldCustomer = await prisma.customer.findFirstOrThrow({ where: { shop: SHOP, email: emails.goldYes } });
      const recommendation = await prisma.analyticsRecommendation.create({
        data: {
          shop: SHOP,
          slug: "win-back",
          type: "inactive_customers",
          title: "Win back",
          description: "Customers who haven't ordered lately",
          segmentPayload: { customerIds: [goldCustomer.id] },
          affectedCount: 1,
          expiresAt: new Date(Date.now() + 24 * HOUR),
        },
      });

      const response = await smartCreate({ sendImmediately: "true", recommendationId: recommendation.id });

      expect(calls.requests).toBe(1);
      expect(response.status).toBe(500);
      const { error } = await response.json();
      expect(error).toMatch(mayHaveGoneOut);
      expect(error).not.toMatch(/saved as a draft/);
      expect(await prisma.emailCampaign.findFirstOrThrow({ where: { shop: SHOP } })).toMatchObject({ status: "failed" });
    });
  });

  describe("a send that was cut off", () => {
    it("is marked as may have gone out once it has been sending for 15 minutes, keeping what SendGrid reported, and isn't sent again", async () => {
      const sent = mockSendGrid();
      const startedAt = new Date(Date.now() - 20 * 60_000);
      const reported = { sent: 0, delivered: 2, opened: 1, clicked: 0, bounced: 0, unsubscribed: 0, revenue: 0, orders: 0 };
      // SendGrid's events kept arriving (webhooks.sendgrid.tsx), so it was updated a minute ago
      const cutOff = await campaign({ status: "sending", segmentRules: { allCustomers: true }, name: "Cut off" });
      await prisma.emailCampaign.update({ where: { id: cutOff.id }, data: { sentAt: startedAt, metrics: reported } });
      const stillSending = await campaign({ status: "sending", segmentRules: { allCustomers: true }, name: "Still sending" });
      await prisma.emailCampaign.update({ where: { id: stillSending.id }, data: { sentAt: new Date(Date.now() - 2 * 60_000) } });

      const response = await runCron();

      expect(sent).toEqual([]);
      expect(response.status).toBe(500);
      expect((await response.json()).summary).toMatchObject({ interrupted: 1 });
      const after = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: cutOff.id } });
      expect(after).toMatchObject({ status: "failed", sentAt: startedAt });
      expect(after.metrics).toMatchObject({ ...reported, interruptedReason: expect.stringMatching(/may have received it/) });
      expect(after.metrics).not.toHaveProperty("notSentReason");
      expect(await prisma.emailCampaign.findUniqueOrThrow({ where: { id: stillSending.id } })).toMatchObject({ status: "sending" });

      await runCron();
      expect(sent).toEqual([]);
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
      expect(after.sentAt).toBeNull();
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

    it("lets only one of two sends at the same moment through when only one fits", async () => {
      const sent = mockSendGrid();
      await usage(998);
      const drafts = [
        await campaign({ status: "draft", segmentRules: { allCustomers: true }, name: "A" }),
        await campaign({ status: "draft", segmentRules: { allCustomers: true }, name: "B" }),
      ];

      const responses = await Promise.all(
        drafts.map((d) => send(d.id, { intent: "send_now", sendToAll: "true", sendToRecommended: "false" })),
      );

      expect(sent).toHaveLength(1);
      expect(responses.map((r) => r.status).sort()).toEqual([302, 400]);
      expect(await emailsUsed()).toBe(1000);
    });

    it("sends nothing when it can't read how many emails are left", async () => {
      const sent = mockSendGrid();
      const draft = await campaign({ status: "draft", segmentRules: { allCustomers: true } });
      swap(prisma.monthlyEmailUsage, "findUnique", (findUnique) => (() => dropped()) as unknown as typeof findUnique);

      const response = await send(draft.id, { intent: "send_now", sendToAll: "true", sendToRecommended: "false" });

      expect(sent).toEqual([]);
      expect(response.status).toBe(400);
      expect(await prisma.emailCampaign.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "draft" });
    });

    it("says so when the audience is bigger than the whole monthly limit", async () => {
      const sent = mockSendGrid();
      await prisma.customer.createMany({
        data: Array.from({ length: 1000 }, (_, i) => ({
          shop: SHOP,
          shopifyCustomerId: `bulk-${i}`,
          email: `bulk-${i}@example.test`,
          currentTierId: bronze.id,
          acceptsMarketing: true,
        })),
      });
      const draft = await campaign({ status: "draft", segmentRules: { allCustomers: true } });

      const response = await send(draft.id, { intent: "send_now", sendToAll: "true", sendToRecommended: "false" });

      expect(sent).toEqual([]);
      expect(response.status).toBe(400);
      const { error } = await response.json();
      expect(error).toMatch(/1,002 customers who agreed to marketing, more than the shop's limit of 1,000 emails a month/);
      expect(error).not.toMatch(/starts again next month/);
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

    it("sends or schedules nothing while marketing email is off, says so plainly, and still saves a draft", async () => {
      const sent = mockSendGrid();
      delete process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;

      for (const fields of [
        { segmentId: "all", scheduleType: "immediate" },
        { segmentId: "all", scheduleType: "scheduled", scheduledDate: nyDate(1), scheduledTime: "09:00" },
      ]) {
        const response = await create(fields);
        expect(response.status).toBe(409);
        const { error } = await response.json();
        expect(error).toMatch(/can't send marketing email yet/);
        expect(error).not.toMatch(/SENDGRID/);
      }
      expect(await prisma.emailCampaign.count({ where: { shop: SHOP } })).toBe(0);

      const saved = await create({ segmentId: bronze.id, scheduleType: "draft" });

      expect(saved.status).toBe(302);
      expect(sent).toEqual([]);
      expect(await prisma.emailCampaign.findFirstOrThrow({ where: { shop: SHOP } })).toMatchObject({
        status: "draft",
        scheduledFor: null,
        segmentRules: { tierIds: [bronze.id] },
      });
    });

    it("tells the merchant plainly on the send page too while marketing email is off", async () => {
      const sent = mockSendGrid();
      delete process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;
      const draft = await campaign({ status: "draft", segmentRules: { allCustomers: true } });

      const page = await (
        await sendLoader({ request: new Request(`https://test.example.com/app/marketing/campaigns/${draft.id}/send`), params: { id: draft.id }, context: {} })
      ).json();
      const response = await send(draft.id, { intent: "send_now", sendToAll: "true", sendToRecommended: "false" });

      expect(response.status).toBe(409);
      for (const text of [page.marketingBlocked, (await response.json()).error]) {
        expect(text).toMatch(/can't send marketing email yet/);
        expect(text).not.toMatch(/SENDGRID/);
      }
      expect(sent).toEqual([]);
      expect(await prisma.emailCampaign.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "draft" });
    });

    it("counts only customers who agreed to marketing, and says plainly when email is off", async () => {
      delete process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;

      const response = await createLoader({
        request: new Request("https://test.example.com/app/marketing/campaigns/create"),
        params: {},
        context: {},
      });

      const data = await response.json();
      expect(data.segments).toEqual([
        { id: "all", name: "All Customers", customerCount: 2 },
        { id: bronze.id, name: "Bronze", customerCount: 1 },
        { id: gold.id, name: "Gold", customerCount: 1 },
      ]);
      expect(data.marketingBlocked).toMatch(/can't send marketing email yet/);
      expect(data.marketingBlocked).not.toMatch(/SENDGRID/);
    });
  });

  describe("Smart Create's Send immediately", () => {
    it("creates nothing while marketing email is off", async () => {
      delete process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;

      const response = await smartCreate({ sendImmediately: "true" });

      expect(response.status).toBe(409);
      expect((await response.json()).error).toMatch(/can't send marketing email yet/);
      expect(await prisma.emailCampaign.count({ where: { shop: SHOP } })).toBe(0);
      expect(await prisma.emailTemplate.count({ where: { shop: SHOP } })).toBe(1);
    });

    it("sends the way the Create page does instead of scheduling it", async () => {
      mockSendGrid();

      const response = await smartCreate({ sendImmediately: "true" });

      // Without a recommendation there is no audience yet, so it stays a draft and says why
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/couldn't tell who this campaign is for/);
      expect(await prisma.emailCampaign.findFirstOrThrow({ where: { shop: SHOP } })).toMatchObject({ status: "draft", scheduledFor: null });
    });
  });
});
