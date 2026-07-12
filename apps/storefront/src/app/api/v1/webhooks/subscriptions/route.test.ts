import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { GET, POST } from "./route";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockAuth = vi.mocked(auth);
const mockQuery = vi.mocked(query);
const subscription = {
  id: "subscription-1",
  user_id: "user-1",
  target_url: "https://participant.example/webhook",
  event_types: ["ingest_run.failed"],
  label: "Participant label",
  status: "active",
  created_at: "2026-07-12T10:00:00Z",
  updated_at: "2026-07-12T10:00:00Z",
  last_delivery_at: null,
  last_delivery_status: null,
  consecutive_failures: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { email: "owner@example.com" } } as never);
});

describe("/api/v1/webhooks/subscriptions operational rights", () => {
  it("does not expose authenticated operational rows as CC0 or cache them", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ exists: true }] } as never)
      .mockResolvedValueOnce({ rows: [subscription] } as never);

    const response = await GET();
    const body = await response.json();

    expect(body.data.subscriptions[0]).not.toHaveProperty("signing_secret");
    expect(body._meta.source_license).toEqual(["proprietary", "internal-only"]);
    expect(body._meta.license).toBe("NOASSERTION");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a one-time secret as private operational data", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ exists: true }] } as never)
      .mockResolvedValueOnce({
        rows: [{ ...subscription, signing_secret: "stored-hash-placeholder" }],
      } as never);

    const response = await POST(
      new Request("https://cambridgetcg.example/api/v1/webhooks/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target_url: subscription.target_url,
          event_types: subscription.event_types,
          label: subscription.label,
        }),
      }) as never,
    );
    const body = await response.json();

    expect(body.data.signing_secret).toMatch(/^whsec_[0-9a-f]{64}$/);
    expect(body.data.rights).toMatchObject({
      operational_fields: expect.stringContaining("private operational data"),
      license: "NOASSERTION",
    });
    expect(body._meta.license).toBe("NOASSERTION");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
