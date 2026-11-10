import { describe, expect, it } from "vitest";
import { SIGNED_ACT_LIMITS } from "./signed-act-config";
import {
  actClientAddress,
  CLOUDFLARE_IPV4_RANGES,
  CLOUDFLARE_IPV6_RANGES,
  createActLimiter,
} from "./signed-act-limits";

// The per-address limit's bucket, and the limiter's classes. Addresses are
// documentation ranges (RFC 5737, RFC 3849) or Cloudflare's published ones.

const address = (headers: Record<string, string>) => actClientAddress(new Headers(headers));
const CF_V4 = "172.64.1.2";
const CF_V6 = "2606:4700::6810:84e5";

describe("actClientAddress", () => {
  it("keys on x-real-ip, and ignores cf-connecting-ip unless x-real-ip is Cloudflare's", () => {
    expect(address({ "x-real-ip": "198.51.100.9", "cf-connecting-ip": "anything-at-all" })).toBe("198.51.100.9");
    expect(address({ "x-real-ip": "198.51.100.9", "cf-connecting-ip": "192.0.2.55" })).toBe("198.51.100.9");
    expect(address({ "x-real-ip": " 198.51.100.9 " })).toBe("198.51.100.9");
    // Through Cloudflare, its header names the client.
    expect(address({ "x-real-ip": CF_V4, "cf-connecting-ip": "192.0.2.55" })).toBe("192.0.2.55");
    expect(address({ "x-real-ip": CF_V6, "cf-connecting-ip": "192.0.2.56" })).toBe("192.0.2.56");
    // Through Cloudflare without a usable client header: the edge's own address.
    expect(address({ "x-real-ip": CF_V4 })).toBe(CF_V4);
    expect(address({ "x-real-ip": CF_V4, "cf-connecting-ip": "anything-at-all" })).toBe(CF_V4);
    expect(address({ "x-real-ip": CF_V4, "cf-connecting-ip": "192.0.2.1, 192.0.2.2" })).toBe(CF_V4);
  });

  it("without a usable x-real-ip, puts every request in one bucket whatever cf-connecting-ip says", () => {
    const cases: Record<string, string>[] = [
      {},
      { "cf-connecting-ip": "192.0.2.55" },
      { "x-real-ip": "", "cf-connecting-ip": "192.0.2.55" },
      { "x-real-ip": "not-an-address", "cf-connecting-ip": "192.0.2.55" },
      { "x-real-ip": "1".repeat(100) },
      { "x-real-ip": "fe80::1%eth0" },
      { "x-real-ip": "198.51.100.9, 198.51.100.10" },
    ];
    for (const headers of cases) {
      expect(address(headers), JSON.stringify(headers)).toBe("unknown");
    }
  });

  it("buckets IPv6 by its /64 and reads an IPv4-mapped address as IPv4", () => {
    const via = (client: string) => address({ "x-real-ip": CF_V4, "cf-connecting-ip": client });
    expect(via("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(via("2001:db8::2")).toBe("2001:db8:0:0::/64");
    expect(via("2001:0DB8:0000:0000:ffff:ffff:ffff:ffff")).toBe("2001:db8:0:0::/64");
    expect(via("2001:db8:0:1::1")).toBe("2001:db8:0:1::/64");
    expect(via("::ffff:192.0.2.9")).toBe("192.0.2.9");
    expect(address({ "x-real-ip": "2001:db8:abcd:12::7" })).toBe("2001:db8:abcd:12::/64");
    // 600 addresses in one /64 are one caller.
    const buckets = new Set(Array.from({ length: 600 }, (_, i) => via(`2001:db8::${i.toString(16)}`)));
    expect([...buckets]).toEqual(["2001:db8:0:0::/64"]);
  });

  it("knows each published Cloudflare range, and not its neighbours", () => {
    for (const range of [...CLOUDFLARE_IPV4_RANGES, ...CLOUDFLARE_IPV6_RANGES]) {
      const network = range.split("/")[0].replace(/::$/, "::1");
      expect(address({ "x-real-ip": network, "cf-connecting-ip": "192.0.2.77" }), range).toBe("192.0.2.77");
    }
    // Just past 173.245.48.0/20 and just before 2606:4700::/32.
    expect(address({ "x-real-ip": "173.245.64.0", "cf-connecting-ip": "192.0.2.77" })).toBe("173.245.64.0");
    expect(address({ "x-real-ip": "2606:46ff:ffff::1", "cf-connecting-ip": "192.0.2.77" })).toBe("2606:46ff:ffff:0::/64");
  });
});

describe("createActLimiter", () => {
  it("defaults: 1,200 exit acts per instance a minute, and the other numbers unchanged", () => {
    expect(SIGNED_ACT_LIMITS).toEqual({
      windowSeconds: 60,
      perAddress: 20,
      perInstance: 600,
      exitPerInstance: 1200,
      perKey: 30,
      maxTrackedAddresses: 10_000,
    });
    const limiter = createActLimiter(undefined, () => 1_000_000);
    for (let i = 0; i < 1200; i += 1) expect(limiter.beforeVerification(`192.0.2.${i % 250}/${i}`, "exit").allowed).toBe(true);
    expect(limiter.beforeVerification("198.51.100.1", "exit")).toMatchObject({ allowed: false, scope: "instance" });
  });

  it("counts previews per address only: no instance ceiling, and apart from acts", () => {
    const limiter = createActLimiter({ ...SIGNED_ACT_LIMITS, perAddress: 2, perInstance: 1, exitPerInstance: 1 }, () => 1_000_000);
    for (let i = 0; i < 50; i += 1) expect(limiter.preview(`2001:db8:${i.toString(16)}::/64`).allowed).toBe(true);
    expect(limiter.preview("192.0.2.1").allowed).toBe(true);
    expect(limiter.preview("192.0.2.1").allowed).toBe(true);
    expect(limiter.preview("192.0.2.1")).toMatchObject({ allowed: false, scope: "address" });
    // Fifty-odd previews later, the instance still has room for one act of each class.
    expect(limiter.beforeVerification("192.0.2.1", "other").allowed).toBe(true);
    expect(limiter.beforeVerification("192.0.2.1", "exit").allowed).toBe(true);
    expect(limiter.beforeVerification("192.0.2.2", "other")).toMatchObject({ allowed: false, scope: "instance" });
  });

  it("says which limit refused: the address, the instance or the key", () => {
    const limiter = createActLimiter({ ...SIGNED_ACT_LIMITS, perAddress: 1, perInstance: 2, perKey: 1 }, () => 1_000_000);
    expect(limiter.beforeVerification("a", "other").allowed).toBe(true);
    expect(limiter.beforeVerification("a", "other")).toEqual({ allowed: false, retryAfterSeconds: 20, scope: "address" });
    expect(limiter.beforeVerification("b", "other").allowed).toBe(true);
    expect(limiter.beforeVerification("c", "other")).toEqual({ allowed: false, retryAfterSeconds: 20, scope: "instance" });
    expect(limiter.afterVerification("kid").allowed).toBe(true);
    expect(limiter.afterVerification("kid")).toEqual({ allowed: false, retryAfterSeconds: 20, scope: "key" });
  });

  it("past the address cap, shares one overflow bucket per class, not one for both", () => {
    const limiter = createActLimiter({ ...SIGNED_ACT_LIMITS, perAddress: 1, maxTrackedAddresses: 1 }, () => 1_000_000);
    expect(limiter.beforeVerification("a", "exit").allowed).toBe(true);
    expect(limiter.beforeVerification("b", "exit").allowed).toBe(true); // exit overflow
    expect(limiter.beforeVerification("c", "exit")).toMatchObject({ allowed: false, scope: "address" }); // exit overflow full
    // The other classes have their own maps and overflow buckets.
    expect(limiter.beforeVerification("d", "other").allowed).toBe(true);
    expect(limiter.beforeVerification("e", "other").allowed).toBe(true);
    expect(limiter.beforeVerification("f", "other").allowed).toBe(false);
    expect(limiter.preview("g").allowed).toBe(true);
    expect(limiter.preview("h").allowed).toBe(true);
    expect(limiter.preview("i").allowed).toBe(false);
  });
});
