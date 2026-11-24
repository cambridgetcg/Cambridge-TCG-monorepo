import { describe, expect, it } from "vitest";
import { createDb } from "@cambridge-tcg/db";
import { dbTimestamp } from "@cambridge-tcg/db/timestamp";

// What src/lib/db.ts's query() gives for a timestamp, read from the client
// itself: postgres.js connects on the first query, so nothing connects here.
describe("the production driver's timestamps", () => {
  const { client } = createDb({ url: "postgres://nobody@127.0.0.1:1/none", ssl: false });
  const parse = (oid: number, text: string) => (client.options.parsers as Record<number, (text: string) => unknown>)[oid]!(text);

  it("are Postgres text, not Dates: drizzle replaces postgres.js's date parsers", () => {
    expect(parse(1184, "2026-07-11 09:30:00.123456+00")).toBe("2026-07-11 09:30:00.123456+00"); // timestamptz
    expect(parse(1114, "2026-07-11 09:30:00")).toBe("2026-07-11 09:30:00"); // timestamp
    expect(parse(1082, "2026-07-11")).toBe("2026-07-11"); // date
  });

  it("become Dates through dbTimestamp, whichever way the moment is written", () => {
    const moment = new Date("2026-07-11T09:30:00.123Z");
    for (const value of [moment, "2026-07-11 09:30:00.123456+00", "2026-07-11 10:30:00.123+01", "2026-07-11T09:30:00.123Z", "2026-07-11T15:00:00.123+05:30"]) {
      expect(dbTimestamp(value)).toEqual(moment);
    }
    for (const value of [null, undefined, "", "2026-07-11", "2026-07-11 09:30:00", "2026-02-30 00:00:00+00", "infinity", 0, new Date(NaN)]) {
      expect(dbTimestamp(value)).toBeNull();
    }
  });
});
