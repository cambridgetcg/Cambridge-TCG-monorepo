import { afterEach, describe, expect, it } from "vitest";
import { requireSourceApproval } from "./source-approval";

const KEYS = [
  "CARDRUSH_APPROVAL_REFERENCE",
  "CARDRUSH_APPROVAL_REVIEWED_AT",
  "CARDRUSH_APPROVED_USE_CASES",
  "TCGPLAYER_APPROVAL_REFERENCE",
  "TCGPLAYER_APPROVAL_REVIEWED_AT",
  "TCGPLAYER_APPROVED_USE_CASES",
  "TCGPLAYER_CLIENT_ID",
] as const;

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

describe("contract source approval gate", () => {
  it("rejects credentials-only activation", () => {
    process.env.TCGPLAYER_CLIENT_ID = "credential-is-not-approval";
    expect(() => requireSourceApproval("tcgplayer", "pricing")).toThrow(
      /Credentials alone do not authorise/,
    );
  });

  it("requires the exact use case recorded in the approval", () => {
    process.env.TCGPLAYER_APPROVAL_REFERENCE = "agreement-2026-07";
    process.env.TCGPLAYER_APPROVAL_REVIEWED_AT = "2026-07-11";
    process.env.TCGPLAYER_APPROVED_USE_CASES = "catalog";

    expect(() => requireSourceApproval("tcgplayer", "pricing")).toThrow(
      /include 'pricing'/,
    );
    expect(requireSourceApproval("tcgplayer", "catalog")).toMatchObject({
      source_id: "tcgplayer",
      agreement_reference: "agreement-2026-07",
      approved_use_cases: ["catalog"],
    });
  });

  it("fails CardRush discovery closed until written approval covers it", () => {
    process.env.CARDRUSH_APPROVAL_REFERENCE = "written-approval-2026-07";
    process.env.CARDRUSH_APPROVAL_REVIEWED_AT = "2026-07-11";
    process.env.CARDRUSH_APPROVED_USE_CASES = "image-archive-and-publication";

    expect(() => requireSourceApproval("cardrush", "sitemap-discovery")).toThrow(
      /include 'sitemap-discovery'/,
    );
  });
});
