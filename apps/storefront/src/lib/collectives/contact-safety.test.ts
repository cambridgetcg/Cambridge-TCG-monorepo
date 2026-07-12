import { describe, expect, it } from "vitest";
import { containsDirectContact } from "./contact-safety";

describe("collective free-text contact safety", () => {
  it("detects common email and UK phone formats", () => {
    expect(containsDirectContact("Write to person@example.org")).toBe(true);
    expect(containsDirectContact("Call +44 20 7946 0958")).toBe(true);
    expect(containsDirectContact("Call 01223 123 456")).toBe(true);
  });

  it("does not mistake dates or opening hours for phone numbers", () => {
    expect(containsDirectContact("Founded 2026-07-11")).toBe(false);
    expect(containsDirectContact("Open 10.00 - 18.00")).toBe(false);
    expect(containsDirectContact("Friday 18:00, tables for 24 players")).toBe(false);
  });
});
