import { describe, it, expect } from "vitest";
import { isDmEmailDue, mergeThreadMessages } from "../thread";

function msg(id: string, createdAt: string) {
  return { id, created_at: createdAt };
}

describe("mergeThreadMessages", () => {
  it("returns the newest page when nothing is loaded yet", () => {
    const page = [msg("a", "2026-07-05T10:00:00Z"), msg("b", "2026-07-05T10:01:00Z")];
    expect(mergeThreadMessages([], page)).toEqual(page);
  });

  it("returns the SAME reference when the poll brings nothing new", () => {
    const current = [msg("a", "2026-07-05T10:00:00Z"), msg("b", "2026-07-05T10:01:00Z")];
    const polled = [msg("a", "2026-07-05T10:00:00Z"), msg("b", "2026-07-05T10:01:00Z")];
    expect(mergeThreadMessages(current, polled)).toBe(current);
  });

  it("appends new messages in ascending order", () => {
    const current = [msg("a", "2026-07-05T10:00:00Z")];
    const polled = [msg("a", "2026-07-05T10:00:00Z"), msg("b", "2026-07-05T10:01:00Z")];
    expect(mergeThreadMessages(current, polled).map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("keeps earlier history the poll page no longer covers", () => {
    // User paged back to old messages; the poll only returns the newest.
    const current = [
      msg("old-1", "2026-07-01T09:00:00Z"),
      msg("old-2", "2026-07-01T09:05:00Z"),
      msg("recent", "2026-07-05T10:00:00Z"),
    ];
    const polled = [msg("recent", "2026-07-05T10:00:00Z"), msg("new", "2026-07-05T10:02:00Z")];
    expect(mergeThreadMessages(current, polled).map((m) => m.id)).toEqual([
      "old-1", "old-2", "recent", "new",
    ]);
  });

  it("breaks same-timestamp ties deterministically by id", () => {
    const t = "2026-07-05T10:00:00Z";
    const merged = mergeThreadMessages([msg("b", t)], [msg("a", t), msg("b", t)]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("isDmEmailDue", () => {
  const earlier = new Date("2026-07-05T08:00:00Z");
  const later = new Date("2026-07-05T09:00:00Z");

  it("due when no email exists inside the window", () => {
    expect(isDmEmailDue({ lastEmailAt: null, recipientLastReadAt: null })).toBe(true);
    expect(isDmEmailDue({ lastEmailAt: null, recipientLastReadAt: earlier })).toBe(true);
  });

  it("NOT due while a prior email points at a still-unread thread", () => {
    expect(isDmEmailDue({ lastEmailAt: later, recipientLastReadAt: null })).toBe(false);
    expect(isDmEmailDue({ lastEmailAt: later, recipientLastReadAt: earlier })).toBe(false);
  });

  it("due again once the recipient read the thread after the last email", () => {
    expect(isDmEmailDue({ lastEmailAt: earlier, recipientLastReadAt: later })).toBe(true);
    // Read at exactly the email instant counts as read.
    expect(isDmEmailDue({ lastEmailAt: earlier, recipientLastReadAt: earlier })).toBe(true);
  });
});
