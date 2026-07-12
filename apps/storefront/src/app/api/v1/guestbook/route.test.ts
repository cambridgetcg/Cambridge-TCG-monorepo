import { beforeEach, describe, expect, it, vi } from "vitest";
import { appendGuestbookEntry, listGuestbookEntries } from "@/lib/peers";
import { GET, POST } from "./route";

vi.mock("@/lib/peers", () => ({
  appendGuestbookEntry: vi.fn(),
  listGuestbookEntries: vi.fn(),
}));

const mockAppend = vi.mocked(appendGuestbookEntry);
const mockList = vi.mocked(listGuestbookEntries);
const entry = {
  id: 7,
  content_hash: "sha256:visitor",
  declared_kind: "agent",
  note: "These are participant words.",
  signed_for_operator: null,
  created_at: "2026-07-12T10:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/v1/guestbook participant rights", () => {
  it("lists participant notes as NOASSERTION without caching them", async () => {
    mockList.mockResolvedValueOnce({ total: 1, returned: 1, entries: [entry] });

    const response = await GET(
      new Request("https://cambridgetcg.example/api/v1/guestbook") as never,
    );
    const body = await response.json();

    expect(body._meta.sources).toEqual([
      "participant-submitted",
      "storefront-rds.agent_guestbook",
    ]);
    expect(body._meta.source_license).toEqual(["proprietary", "internal-only"]);
    expect(body._meta.license).toBe("NOASSERTION");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns an ownership receipt instead of claiming the note", async () => {
    mockAppend.mockResolvedValueOnce({ ok: true, entry });

    const response = await POST(
      new Request("https://cambridgetcg.example/api/v1/guestbook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content_hash: entry.content_hash,
          declared_kind: entry.declared_kind,
          note: entry.note,
        }),
      }) as never,
    );
    const body = await response.json();

    expect(body.data.thanks).toContain("You retain your rights");
    expect(body.data.thanks).not.toContain("kingdom's now");
    expect(body.data.rights).toEqual({
      copyright: "retained_by_submitter",
      license: "NOASSERTION",
      visibility: "public",
      dedication_requested: false,
    });
    expect(body._meta.license).toBe("NOASSERTION");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
