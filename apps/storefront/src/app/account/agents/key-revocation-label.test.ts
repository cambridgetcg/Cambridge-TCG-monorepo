import { describe, expect, it } from "vitest";
import {
  ARCHIVE_REVOCATION_REASON,
  HOLDER_REVOCATION_REASON,
} from "@/lib/agents/revocation-reasons";
import { keyRevocationLabel } from "./key-revocation-label";

describe("keyRevocationLabel", () => {
  it.each([
    [HOLDER_REVOCATION_REASON, "revoked by the key holder"],
    [ARCHIVE_REVOCATION_REASON, "revoked when the agent was archived"],
    ["admin archive: repeated abuse from 203.0.113.9", "revoked by Cambridge TCG staff"],
    ["admin revoke: leaked in a support ticket", "revoked by Cambridge TCG staff"],
    ["rotated after laptop loss", "revoked from this page"],
    [null, "revoked from this page"],
    ["", "revoked from this page"],
  ])("maps %j to a category", (reason, label) => {
    expect(keyRevocationLabel(reason)).toBe(label);
  });

  it("never carries the reason text into the label", () => {
    for (const reason of [
      "admin archive: private staff note",
      "my own private note",
      `${HOLDER_REVOCATION_REASON} extra`,
    ]) {
      const label = keyRevocationLabel(reason);
      expect(label).not.toContain("private");
      expect(label).not.toContain("extra");
    }
  });

  it("matches the sentinels exactly", () => {
    expect(keyRevocationLabel(`${HOLDER_REVOCATION_REASON} extra`)).toBe("revoked from this page");
    expect(keyRevocationLabel(`${ARCHIVE_REVOCATION_REASON} `)).toBe("revoked from this page");
  });
});
