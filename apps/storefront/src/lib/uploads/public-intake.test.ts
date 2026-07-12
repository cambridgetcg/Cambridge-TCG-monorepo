import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

// POST is a hard release pause, so none of these dependencies should run.
// Replacing them also keeps this contract test independent of sessions and DB.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ isAdmin: vi.fn() }));
vi.mock("@/lib/auction/db", () => ({
  getAuctionSellerId: vi.fn(),
  removeAuctionImage: vi.fn(),
}));
vi.mock("@/lib/market/db", () => ({
  getTradeParticipants: vi.fn(),
  listTradePhotos: vi.fn(),
}));
vi.mock("@/lib/auction/s3", () => ({ deleteS3Object: vi.fn() }));

import { POST as pauseQuoteImage } from "@/app/api/quotes/upload/route";
import { POST as pauseAvatar } from "@/app/api/account/profile/avatar/route";
import { POST as pauseAuctionImage } from "@/app/api/auctions/upload/route";
import { POST as rejectAuctionImageUrl } from "@/app/api/auctions/[id]/images/route";
import { POST as pauseTradePhoto } from "@/app/api/market/trades/[id]/photos/upload/route";
import { POST as rejectTradePhotoUrl } from "@/app/api/market/trades/[id]/photos/route";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function TypeScriptFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = resolve(root, entry);
    if (statSync(path).isDirectory()) return TypeScriptFiles(path);
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

describe("public upload release off-switch", () => {
  const doors: Array<{
    name: string;
    kind: string;
    invoke: () => Promise<Response>;
  }> = [
    { name: "quote image presign", kind: "quote_image", invoke: pauseQuoteImage },
    { name: "avatar presign or URL registration", kind: "avatar", invoke: pauseAvatar },
    { name: "auction image presign", kind: "auction_image", invoke: pauseAuctionImage },
    { name: "auction image URL registration", kind: "auction_image", invoke: rejectAuctionImageUrl },
    { name: "trade photo presign", kind: "trade_photo", invoke: pauseTradePhoto },
    { name: "trade photo URL registration", kind: "trade_photo", invoke: rejectTradePhotoUrl },
  ];

  it.each(doors)("fails closed at $name", async ({ kind, invoke }) => {
    // The URL-registration cases deliberately receive no valid session,
    // storage key or issued token. The hard pause must win before any of
    // those values can be trusted or persisted.
    const response = await invoke();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({
      code: "public_upload_intake_paused",
      upload_kind: kind,
      docs: "/privacy",
    });
    expect(body.uploadUrl).toBeUndefined();
    expect(body.imageUrl).toBeUndefined();
    expect(body.s3Key).toBeUndefined();
  });

  it("leaves no presign call in a storefront API route or helper", () => {
    const apiRoot = resolve(process.cwd(), "src/app/api");
    const apiSource = TypeScriptFiles(apiRoot).map((path) => readFileSync(path, "utf8")).join("\n");

    expect(apiSource).not.toContain("getPresignedUploadUrl");
    expect(apiSource).not.toContain("getTradePhotoUploadUrl");
    expect(apiSource).not.toContain("getSignedUrl");
    expect(apiSource).not.toContain("PutObjectCommand");
    expect(apiSource).not.toContain('from "@cambridge-tcg/aws/s3"');
    expect(source("src/lib/auction/s3.ts")).not.toContain("awsPresign");
    expect(source("src/lib/market/photos.ts")).not.toContain("awsPresign");
  });

  it("blocks the general profile PATCH from becoming an avatar URL bypass", () => {
    const profile = source("src/app/api/social/profile/route.ts");
    const patch = profile.slice(profile.indexOf("export async function PATCH"));
    const gate = patch.indexOf("avatarUploadRequested");
    const update = patch.indexOf("await updateProfile");

    expect(gate).toBeGreaterThan(0);
    expect(update).toBeGreaterThan(gate);
    expect(patch).toContain('publicUploadIntakePausedResponse("avatar")');
    expect(patch).not.toContain("avatarUrl:");
  });

  it("keeps retired quote persistence closed and removes upload controls", () => {
    const quote = source("src/app/api/quotes/route.ts");
    expect(quote).toContain('code: "DEPRECATED"');
    expect(quote).not.toContain("createQuote");

    const sellerAuction = source("src/app/auctions/sell/page.tsx");
    const adminAuction = source("src/app/admin/auctions/new/page.tsx");
    expect(sellerAuction).not.toContain('fetch("/api/auctions/upload"');
    expect(adminAuction).not.toContain('fetch("/api/auctions/upload"');

    const tradeList = source("src/app/account/trades/page.tsx");
    const tradeListPhotoStep = tradeList.slice(
      tradeList.indexOf("function TradePhotoUploader"),
      tradeList.indexOf("interface PendingCancel"),
    );
    expect(tradeListPhotoStep).not.toContain("/photos/upload");
    expect(tradeListPhotoStep).not.toContain('type="file"');

    const tradeDetail = source("src/app/account/trades/[id]/page.tsx");
    const tradeDetailPhotoStep = tradeDetail.slice(
      tradeDetail.indexOf("function TradePhotoStep"),
      tradeDetail.indexOf("function addressLines"),
    );
    expect(tradeDetailPhotoStep).not.toContain("/photos/upload");
    expect(tradeDetailPhotoStep).not.toContain('type="file"');
  });
});
