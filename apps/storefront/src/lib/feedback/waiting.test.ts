import { describe, expect, it, vi } from "vitest";
import { FEEDBACK_RETENTION_DAYS } from "./door";
import { FEEDBACK_EXPIRING_DAYS, FEEDBACK_WAITING_SQL, ageWords, readFeedbackWaiting } from "./waiting";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const ROW = { held: 9, unread: 3, unanswered: 1, expiring: 2, oldest_unread_hours: 98, oldest_unanswered_hours: null };
const answering = (...rows: (Record<string, unknown> | undefined)[]) => vi.fn(async () => ({ rows: rows.filter(Boolean) as Record<string, unknown>[] }));

describe("reading what waits at the feedback door", () => {
  it("returns the database's counts and ages, whichever driver gave them, from one statement", async () => {
    const counted = { held: 9, unread: 3, unanswered: 1, expiring: 2, oldestUnreadHours: 98, oldestUnansweredHours: null };
    const run = answering(ROW);
    expect(await readFeedbackWaiting(run)).toEqual(counted);
    expect(run.mock.calls).toEqual([[FEEDBACK_WAITING_SQL]]);
    // A driver that hands integers over as text is read the same.
    expect(await readFeedbackWaiting(answering({ ...ROW, held: "9", oldest_unread_hours: "98" }))).toEqual(counted);
    expect(await readFeedbackWaiting(answering({ ...ROW, held: 0, unread: 0, unanswered: 0, expiring: 0, oldest_unread_hours: null }))).toEqual({
      held: 0, unread: 0, unanswered: 0, expiring: 0, oldestUnreadHours: null, oldestUnansweredHours: null,
    });
  });

  it.each([
    undefined, {}, { ...ROW, unread: null }, { ...ROW, held: undefined }, { ...ROW, held: -1 }, { ...ROW, unanswered: 1.5 }, { ...ROW, expiring: "many" },
    { ...ROW, unread: "" }, { ...ROW, unread: " " }, { ...ROW, held: Number.NaN }, { ...ROW, held: true }, { ...ROW, oldest_unread_hours: "soon" }, { ...ROW, oldest_unanswered_hours: -1 },
  ])("throws rather than count %j as zero", async (row) => {
    await expect(readFeedbackWaiting(answering(row))).rejects.toThrow(TypeError);
  });

  it("lets what the database throws through", async () => {
    await expect(readFeedbackWaiting(async () => { throw new Error("busy"); })).rejects.toThrow("busy");
  });

  it("selects counts and ages only, of messages that have not expired", () => {
    expect(FEEDBACK_WAITING_SQL).toMatch(/FROM public_feedback WHERE expires_at > now\(\)$/);
    expect(FEEDBACK_WAITING_SQL).toContain(`interval '${FEEDBACK_EXPIRING_DAYS} days'`);
    for (const column of ["message", "details", "reply_to", "reply_name", "feedback_id", "holder_key_sha256", "kind", "topic", "answer", "answered_at"]) {
      expect(FEEDBACK_WAITING_SQL).not.toMatch(new RegExp(`\\b${column}\\b`));
    }
    expect(FEEDBACK_EXPIRING_DAYS).toBeLessThan(FEEDBACK_RETENTION_DAYS);
  });

  it("says an age in whole hours, with the days beside them from two days on", () => {
    expect([0, 1, 5, 47, 48, 71, 72, 98, 4080].map(ageWords)).toEqual([
      "under an hour", "1 hour", "5 hours", "47 hours", "48 hours (2 days)", "71 hours (2 days)", "72 hours (3 days)", "98 hours (4 days)", "4,080 hours (170 days)",
    ]);
  });
});
