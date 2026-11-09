import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionContext } from "~/lib/merchant.server";

// The session is the library's job, and the connection the database's: both are stand-ins here.
vi.mock("~/shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("~/lib/merchant.server", () => ({ findConnection: vi.fn() }));
vi.mock("~/shopify/install.server", () => ({ onAppOpened: vi.fn() }));

const { authenticate } = await import("~/shopify.server");
const { findConnection } = await import("~/lib/merchant.server");
const { onAppOpened } = await import("~/shopify/install.server");
const { monitoring } = await import("~/lib/telemetry.server");
const { requireMerchant } = await import("~/admin/require-merchant.server");

const SHOP = "require-merchant.myshopify.com";
const session = { shop: SHOP };
const admin = { graphql: vi.fn() };
const conn = { connectionId: "c1", merchantId: "m1", shop: SHOP } as ConnectionContext;
const request = new Request("https://test.example.com/app");

let tagShop: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.mocked(authenticate.admin).mockResolvedValue({ admin, session } as never);
  tagShop = vi.spyOn(monitoring, "tagShop");
});
afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe("requireMerchant", () => {
  it("answers the store's connection, opening nothing, when it has one", async () => {
    vi.mocked(findConnection).mockResolvedValue(conn);

    await expect(requireMerchant(request)).resolves.toEqual({ admin, session, conn });

    expect(onAppOpened).not.toHaveBeenCalled();
    expect(findConnection).toHaveBeenCalledTimes(1);
    expect(findConnection).toHaveBeenCalledWith(SHOP);
  });

  // A18-F1: a session that outlived its connection runs the open once, then reads the connection again
  it("runs the app's open once when the connection is missing, and answers the connection it made", async () => {
    vi.mocked(findConnection).mockResolvedValueOnce(null).mockResolvedValueOnce(conn);

    await expect(requireMerchant(request)).resolves.toEqual({ admin, session, conn });

    expect(onAppOpened).toHaveBeenCalledTimes(1);
    expect(onAppOpened).toHaveBeenCalledWith({ session, admin });
    expect(findConnection).toHaveBeenCalledTimes(2);
  });

  it("fails when the open made no connection", async () => {
    vi.mocked(findConnection).mockResolvedValue(null);

    await expect(requireMerchant(request)).rejects.toThrow(/No active connection/);
    expect(onAppOpened).toHaveBeenCalledTimes(1);
    expect(tagShop).toHaveBeenCalledWith(SHOP);
  });

  // OPERATIONS-8: an admin failure reaches Sentry with the store it happened to, never a buyer
  it("tags monitoring with the store's domain", async () => {
    vi.mocked(findConnection).mockResolvedValue(conn);

    await requireMerchant(request);

    expect(tagShop).toHaveBeenCalledWith(SHOP);
  });

  it("passes on a response the library throws, unchanged", async () => {
    const bounce = new Response(null, { status: 302, headers: { Location: "/auth/login" } });
    vi.mocked(authenticate.admin).mockRejectedValue(bounce);

    await expect(requireMerchant(request)).rejects.toBe(bounce);
    expect(findConnection).not.toHaveBeenCalled();
  });
});
