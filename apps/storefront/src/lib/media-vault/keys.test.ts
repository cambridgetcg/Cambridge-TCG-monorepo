import { describe, expect, it } from "vitest";

import { createCollectorMediaIdentity, isCollectorMediaObjectKey, isUuid } from "./keys";

describe("collector media identities", () => {
  it("creates opaque unique ids and 256-bit random keys", () => {
    const identities = Array.from({ length: 40 }, () => createCollectorMediaIdentity());

    expect(new Set(identities.map((item) => item.id)).size).toBe(40);
    expect(new Set(identities.map((item) => item.objectKey)).size).toBe(40);
    for (const item of identities) {
      expect(isUuid(item.id)).toBe(true);
      expect(isCollectorMediaObjectKey(item.objectKey)).toBe(true);
      expect(item.objectKey).not.toContain(item.id);
    }
  });

  it("rejects caller-shaped paths", () => {
    expect(isCollectorMediaObjectKey("collector-media/v1/user@example.com/photo.webp")).toBe(
      false,
    );
    expect(isCollectorMediaObjectKey("../public/photo.webp")).toBe(false);
    expect(isUuid("not-an-id")).toBe(false);
  });
});
