import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  emailEvent: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  customer: {
    updateMany: vi.fn(),
  },
  emailCampaign: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("~/db.server", () => ({ default: prisma, db: prisma }));

import {
  action as challengesAction,
  loader as challengesLoader,
} from "~/routes/api.customer-account.challenges";
import {
  action as missionsAction,
  loader as missionsLoader,
} from "~/routes/api.customer-account.missions";
import {
  action as mysteryBoxesAction,
  loader as mysteryBoxesLoader,
} from "~/routes/api.customer-account.mystery-boxes";
import {
  action as rafflesAction,
  loader as rafflesLoader,
} from "~/routes/api.customer-account.raffles";
import {
  action as integrationWebhookAction,
  loader as integrationWebhookLoader,
} from "~/routes/api.integrations.webhooks.$provider";
import { loader as healthLoader } from "~/routes/api.health";
import { action as sendGridAction } from "~/routes/webhooks.sendgrid";
import { verifyCronAuth } from "~/utils/cron-auth.server";

type RouteHandler = (args: unknown) => Response | Promise<Response>;

const unreadableRequest = new Proxy(
  {},
  {
    get() {
      throw new Error("The request must not be inspected");
    },
  },
) as Request;

const customerAccountRoutes: Array<[string, RouteHandler]> = [
  ["challenges GET", challengesLoader as RouteHandler],
  ["challenges POST", challengesAction as RouteHandler],
  ["missions GET", missionsLoader as RouteHandler],
  ["missions POST", missionsAction as RouteHandler],
  ["mystery boxes GET", mysteryBoxesLoader as RouteHandler],
  ["mystery boxes POST", mysteryBoxesAction as RouteHandler],
  ["raffles GET", rafflesLoader as RouteHandler],
  ["raffles POST", rafflesAction as RouteHandler],
];

describe("Customer Account gamification boundary", () => {
  it.each(customerAccountRoutes)(
    "%s returns 503 without reading caller-controlled identity",
    async (_name, handler) => {
      const response = await handler({
        request: unreadableRequest,
        params: new Proxy(
          {},
          {
            get: () => {
              throw new Error("params read");
            },
          },
        ),
      });

      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({
        code: "CUSTOMER_ACCOUNT_IDENTITY_BINDING_REQUIRED",
      });
    },
  );
});

describe("shared cron authentication", () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalBypass = process.env.ALLOW_DEV_CRON_BYPASS;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;

    if (originalBypass === undefined) delete process.env.ALLOW_DEV_CRON_BYPASS;
    else process.env.ALLOW_DEV_CRON_BYPASS = originalBypass;
  });

  it("accepts only the exact configured bearer token", () => {
    process.env.CRON_SECRET = "correct-secret";

    expect(
      verifyCronAuth(
        new Request("https://example.test/api/cron/job", {
          headers: { Authorization: "Bearer correct-secret" },
        }),
      ),
    ).toBe(true);

    for (const authorization of [
      "bearer correct-secret",
      "Bearer  correct-secret",
      "Bearer correct-secret-extra",
      "correct-secret",
    ]) {
      expect(
        verifyCronAuth(
          new Request("https://example.test/api/cron/job", {
            headers: { Authorization: authorization },
          }),
        ),
      ).toBe(false);
    }
  });

  it("rejects marker headers, development bypasses, and missing secrets", () => {
    delete process.env.CRON_SECRET;
    process.env.ALLOW_DEV_CRON_BYPASS = "true";

    expect(
      verifyCronAuth(
        new Request("https://example.test/api/cron/job?secret=anything", {
          headers: { "x-vercel-cron": "1" },
        }),
      ),
    ).toBe(false);
  });
});

describe("every cron route uses the shared fail-closed boundary", () => {
  const routesDirectory = resolve(__dirname, "../../../app/routes");
  const cronRouteFiles = readdirSync(routesDirectory)
    .filter((name) => /^api\.cron\..+\.tsx$/.test(name))
    .sort();
  const nonMutatingMethodResponses = new Set([
    "api.cron.exchange-rates.tsx:action",
    "api.cron.metrics.tsx:action",
  ]);

  interface ExportedHandler {
    name: "loader" | "action";
    args: string;
    body: string;
  }

  function exportedHandlers(source: string): ExportedHandler[] {
    const pattern =
      /export\s+(?:const\s+(loader|action)\s*=\s*async\s*\(([^)]*)\)\s*=>\s*\{|async\s+function\s+(loader|action)\s*\(([^)]*)\)\s*\{)/g;
    const matches = [...source.matchAll(pattern)];

    return matches.map((match, index) => ({
      name: (match[1] ?? match[3]) as "loader" | "action",
      args: match[2] ?? match[4] ?? "",
      body: source.slice(
        (match.index ?? 0) + match[0].length,
        matches[index + 1]?.index ?? source.length,
      ),
    }));
  }

  function jsonResponsePayloads(source: string): string[] {
    const payloads: string[] = [];
    const marker = /return\s+json\s*\(/g;

    for (const match of source.matchAll(marker)) {
      const start = (match.index ?? 0) + match[0].length;
      const brackets: string[] = [];
      let quote: "'" | '"' | "`" | null = null;
      let escaped = false;

      for (let index = start; index < source.length; index++) {
        const character = source[index];

        if (quote) {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === quote) quote = null;
          continue;
        }

        if (character === "'" || character === '"' || character === "`") {
          quote = character;
          continue;
        }

        if (character === "(" || character === "[" || character === "{") {
          brackets.push(character);
          continue;
        }

        if (character === ")" || character === "]" || character === "}") {
          if (character === ")" && brackets.length === 0) {
            payloads.push(source.slice(start, index).trim());
            break;
          }
          brackets.pop();
          continue;
        }

        if (character === "," && brackets.length === 0) {
          payloads.push(source.slice(start, index).trim());
          break;
        }
      }
    }

    return payloads;
  }

  it("discovers the complete cron route surface", () => {
    expect(cronRouteFiles).toHaveLength(24);
  });

  it.each(cronRouteFiles)("%s has no alternate credential path", (file) => {
    const source = readFileSync(resolve(routesDirectory, file), "utf8");

    expect(source).toContain(
      'import { verifyCronAuth } from "~/utils/cron-auth.server";',
    );
    expect(source).not.toMatch(/x-cron-secret/i);
    expect(source).not.toMatch(/x-vercel-cron/i);
    expect(source).not.toContain("ALLOW_DEV_CRON_BYPASS");
    expect(source).not.toContain("process.env.CRON_SECRET");
    expect(source).not.toContain("timingSafeEqual");
    expect(source).not.toContain("authenticate.admin");
    expect(source).not.toContain("request.headers.get");
    expect(source).not.toMatch(/searchParams\.get\(["']secret["']\)/);
  });

  it.each(cronRouteFiles)(
    "%s authenticates every mutating handler before work",
    (file) => {
      const source = readFileSync(resolve(routesDirectory, file), "utf8");
      const handlers = exportedHandlers(source);
      expect(handlers.length).toBeGreaterThan(0);

      for (const handler of handlers) {
        const handlerId = `${file}:${handler.name}`;

        if (nonMutatingMethodResponses.has(handlerId)) {
          expect(handler.args.trim()).toBe("");
          expect(handler.body).toContain("status: 405");
          expect(handler.body).toContain("Allow:");
          expect(handler.body).not.toContain("verifyCronAuth");
          expect(handler.body).not.toMatch(
            /\bawait\b|request\.|process\.env|console\.|Logger\.|prisma\.|db\.|cleanupExpiredLocks|acquireCronLock/,
          );
          continue;
        }

        expect(handler.args).toContain("request");
        const authIndex = handler.body.indexOf(
          "if (!verifyCronAuth(request))",
        );
        expect(authIndex, `${handlerId} must call shared auth`).toBeGreaterThanOrEqual(0);

        const beforeAuth = handler.body.slice(0, authIndex);
        expect(beforeAuth, `${handlerId} performs work before auth`).not.toMatch(
          /\bawait\b|request\.|Date\.now|randomUUID|console\.|Logger\.|CorrelationId\.|prisma\.|db\.|new URL|cleanupExpiredLocks|acquireCronLock/,
        );

        expect(handler.body.slice(authIndex, authIndex + 180)).toMatch(
          /return new Response\(["']Unauthorized["'], \{ status: 401 \}\)/,
        );
      }
    },
  );

  it.each(cronRouteFiles)("%s redacts HTTP error details", (file) => {
    const source = readFileSync(resolve(routesDirectory, file), "utf8");
    const payloads = jsonResponsePayloads(source);
    expect(payloads.length).toBeGreaterThan(0);

    for (const payload of payloads) {
      expect(payload).not.toMatch(
        /(?:\([^)]*error[^)]*\)|\b[A-Za-z]*error)\.message\b/i,
      );
      expect(payload).not.toMatch(/\berrorDetails\s*:/);
      expect(payload).not.toMatch(/\bdetails\s*:/);
      expect(payload).not.toMatch(/\berrors\s*:/);
      expect(payload).not.toMatch(/\.\.\.\s*(?:result|results)\b/);
    }
  });
});

describe("generic integration webhook boundary", () => {
  it.each([
    ["GET", integrationWebhookLoader as RouteHandler],
    ["POST", integrationWebhookAction as RouteHandler],
  ])(
    "%s returns 503 before reading the provider or request",
    async (_method, handler) => {
      const response = await handler({
        request: unreadableRequest,
        params: new Proxy(
          {},
          {
            get: () => {
              throw new Error("params read");
            },
          },
        ),
      });

      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({
        code: "PROVIDER_VERIFICATION_REQUIRED",
      });
    },
  );
});

describe("SendGrid webhook boundary", () => {
  const originalVerificationKey = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;

  afterEach(() => {
    if (originalVerificationKey === undefined) {
      delete process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;
    } else {
      process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY = originalVerificationKey;
    }
  });

  it.each([undefined, "", "   "])(
    "returns 503 before reading a body or writing when verification key is %p",
    async (verificationKey) => {
      if (verificationKey === undefined) {
        delete process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;
      } else {
        process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY = verificationKey;
      }

      const text = vi.fn(() => {
        throw new Error("body read");
      });
      const headersGet = vi.fn(() => {
        throw new Error("signature header read");
      });

      const response = await sendGridAction({
        request: {
          method: "POST",
          text,
          headers: { get: headersGet },
        } as unknown as Request,
        params: {},
        context: {},
      });

      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(text).not.toHaveBeenCalled();
      expect(headersGet).not.toHaveBeenCalled();
      expect(prisma.emailEvent.findMany).not.toHaveBeenCalled();
      expect(prisma.emailEvent.create).not.toHaveBeenCalled();
      expect(prisma.customer.updateMany).not.toHaveBeenCalled();
      expect(prisma.emailCampaign.findFirst).not.toHaveBeenCalled();
      expect(prisma.emailCampaign.updateMany).not.toHaveBeenCalled();
    },
  );
});

describe("public health boundary", () => {
  it("returns only bounded process liveness without inspecting the request", async () => {
    const response = await (healthLoader as RouteHandler)({
      request: unreadableRequest,
      params: {},
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});

describe("password encoding utility", () => {
  it("contains no credential or full database URL", () => {
    const source = readFileSync(
      resolve(__dirname, "../../../encode-password.ts"),
      "utf8",
    );

    expect(source).toContain("REWARDSPRO_DATABASE_PASSWORD");
    expect(source).not.toContain("postgresql://");
    expect(source).not.toContain("rewardspro-dev.cluster");
    expect(source).not.toMatch(/const password\s*=\s*["'][^"']+["']/);
  });
});
