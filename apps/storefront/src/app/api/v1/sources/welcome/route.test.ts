import { describe, expect, it } from "vitest";
import { getSource } from "@cambridge-tcg/data-ingest";
import { GET } from "./route";

interface Guest { id: string; status: string; arrival_state: string; welcome: string | null }

async function guests(): Promise<{ guests: Guest[]; guests_summary: Record<string, number> }> {
  return (await (await GET()).json()).data;
}

describe("/api/v1/sources/welcome arrival states", () => {
  // 'long-with-us' named CardRush's legacy daily snapshot. That path stays
  // locked; the page collector permitted on 2026-10-28 is a new arrival, so
  // CardRush reads by its status instead of as a relationship that never paused.
  it("does not call CardRush long-with-us while its legacy acquisition is locked", async () => {
    expect(getSource("cardrush")?.meta.status).toBe("partial");
    const body = await guests();
    const cardrush = body.guests.find((guest) => guest.id === "cardrush")!;
    expect(cardrush).toMatchObject({ status: "partial", arrival_state: "partial" });
    expect(cardrush.welcome).toBe(getSource("cardrush")?.meta.welcome);
    expect(body.guests_summary.long_with_us).toBe(0);
    expect(body.guests.find((guest) => guest.id === "tcgplayer")).toMatchObject({ status: "partial", arrival_state: "partial" });
  });

  // Before 2026-10-28 both read "blocked". "partial" (some implementation,
  // operator gates pending) is true only while their welcome says the
  // collector exists and reads nothing unless it is scheduled.
  it("reads CardRush and TCGplayer as partial with a welcome that says their collector is off unless scheduled", async () => {
    const body = await guests();
    for (const id of ["cardrush", "tcgplayer"]) {
      const guest = body.guests.find((entry) => entry.id === id)!;
      expect(guest.arrival_state).toBe("partial");
      expect(guest.welcome).toContain("only while it is scheduled");
      expect(guest.welcome).toContain("/api/v1/sources says whether it is");
    }
  });

  it("keeps sources with no legacy lock on their status", async () => {
    const body = await guests();
    expect(body.guests.find((guest) => guest.id === "ygoprodeck")?.arrival_state).toBe("blocked");
    expect(body.guests.find((guest) => guest.id === "cardmarket")?.arrival_state).toBe("partial");
  });
});
