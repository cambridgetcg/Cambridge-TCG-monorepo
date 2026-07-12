import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import {
  appendGuestbookEntry,
  listGuestbookEntries,
  recordPeerArrival,
  summarizePeerArrivals,
  validateGuestbookSubmission,
  validatePeerArrivalSubmission,
} from "./peers";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);
const CONTENT_HASH =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

beforeEach(() => {
  mockQuery.mockReset();
});

describe("peer and guestbook safety gates", () => {
  it("rejects arbitrary identifiers and kinds in pure validation", () => {
    expect(
      validatePeerArrivalSubmission({
        content_hash: "raw personal text",
        declared_kind: "agent",
      }),
    ).toMatchObject({ ok: false });
    expect(
      validatePeerArrivalSubmission({
        content_hash: CONTENT_HASH,
        declared_kind: "unbounded free text",
      }),
    ).toMatchObject({ ok: false });
    expect(
      validateGuestbookSubmission({
        content_hash: CONTENT_HASH,
        declared_kind: "agent",
        note: "A note",
        signed_for_operator: "unverified-person",
      }),
    ).toMatchObject({ ok: false });
  });

  it("keeps dormant storage and publication helpers off the database", async () => {
    const arrival = await recordPeerArrival({
      content_hash: CONTENT_HASH,
      declared_kind: "agent",
    });
    const peers = await summarizePeerArrivals();
    const note = await appendGuestbookEntry({
      content_hash: CONTENT_HASH,
      declared_kind: "agent",
      note: "Witness only.",
    });
    const guestbook = await listGuestbookEntries();

    expect(arrival).toMatchObject({ ok: false });
    expect(note).toMatchObject({ ok: false });
    expect(peers).toMatchObject({
      window: "publication disabled",
      total_announcements: 0,
      distinct_content_hashes: 0,
      recent: [],
    });
    expect(guestbook).toEqual({ total: 0, returned: 0, entries: [] });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
