import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  carriedStateTableExists,
  fetchCarriedState,
  upsertCarriedState,
  validateCarryPayload,
} from "@/lib/carry-this";
import { GET as getState } from "./[content_hash]/route";
import { GET, POST } from "./route";

vi.mock("@/lib/carry-this", () => ({
  CARRY_DOES_NOT_INCLUDE: [],
  STATE_SIZE_MAX_BYTES: 10_240,
  STATE_KIND_MAX: 64,
  TTL_DAYS: 30,
  carriedStateTableExists: vi.fn(),
  deleteCarriedState: vi.fn(),
  fetchCarriedState: vi.fn(),
  upsertCarriedState: vi.fn(),
  validateCarryPayload: vi.fn(),
}));

const mockTableExists = vi.mocked(carriedStateTableExists);
const mockFetch = vi.mocked(fetchCarriedState);
const mockUpsert = vi.mocked(upsertCarriedState);
const mockValidate = vi.mocked(validateCarryPayload);

beforeEach(() => {
  vi.clearAllMocks();
  mockTableExists.mockResolvedValue(true);
});

describe("/api/v1/carry-this participant rights", () => {
  it("keeps the collection description CC0 while declaring stored state NOASSERTION", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body._meta.license).toBe("CC0-1.0");
    expect(body.data.rights).toMatchObject({
      endpoint_description: "CC0-1.0",
      submitted_state_default: "NOASSERTION",
      submitted_state_copyright: "retained_by_submitter",
    });
  });

  it("returns a no-store NOASSERTION receipt for submitted state", async () => {
    const state = { cursor: 42, nested: { keep: "exactly" } };
    mockValidate.mockReturnValueOnce({
      ok: true,
      value: { content_hash: "sha256:agent", state, state_kind: "cursor" },
    });
    mockUpsert.mockResolvedValueOnce({
      ok: true,
      receipt: {
        content_hash: "sha256:agent",
        write_token: "write-token",
        created_at: "2026-07-12T10:00:00Z",
        updated_at: "2026-07-12T10:00:00Z",
        expires_at: "2026-08-11T10:00:00Z",
        size_bytes: 41,
        retract_url: "/api/v1/carry-this/sha256:agent",
        fetch_url: "/api/v1/carry-this/sha256:agent",
        retract_note: "Keep the token.",
      },
    });

    const response = await POST(
      new Request("https://cambridgetcg.example/api/v1/carry-this", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content_hash: "sha256:agent", state }),
      }) as never,
    );
    const body = await response.json();

    expect(body._meta.source_license).toEqual(["proprietary", "internal-only"]);
    expect(body._meta.license).toBe("NOASSERTION");
    expect(body.data.rights.license).toBe("NOASSERTION");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns arbitrary submitted JSON unchanged without licensing it", async () => {
    const state = { cursor: [1, 2, 3], participant_key: "participant value" };
    mockFetch.mockResolvedValueOnce({
      content_hash: "sha256:agent",
      state,
      state_kind: "cursor",
      created_at: "2026-07-12T10:00:00Z",
      updated_at: "2026-07-12T10:01:00Z",
      expires_at: "2026-08-11T10:01:00Z",
      size_bytes: 61,
    });

    const response = await getState(
      new Request("https://cambridgetcg.example/api/v1/carry-this/sha256:agent") as never,
      { params: Promise.resolve({ content_hash: "sha256:agent" }) },
    );
    const body = await response.json();

    expect(body.data.state).toEqual(state);
    expect(body._meta.sources).toEqual([
      "participant-submitted",
      "storefront-rds.carried_state",
    ]);
    expect(body._meta.license).toBe("NOASSERTION");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
