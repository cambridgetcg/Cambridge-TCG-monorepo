import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { GET as getNote } from "./[id]/route";
import { GET, POST } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);
const NOTE_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mockQuery.mockReset();
});

describe("/api/v1/agents/notes participant rights", () => {
  it("keeps the editorial seed CC0 when no participant rows are returned", async () => {
    const response = await GET(
      new Request("https://cambridgetcg.example/api/v1/agents/notes?source=seed") as never,
    );
    const body = await response.json();

    expect(body._meta.sources).toEqual(["ctcg-editorial-seed"]);
    expect(body._meta.source_license).toEqual(["cc0"]);
    expect(body._meta.license).toBe("CC0-1.0");
    expect(body.data.entries.every((entry: { source_license: string }) =>
      entry.source_license === "CC0-1.0",
    )).toBe(true);
  });

  it("does not read or publish stored participant notes", async () => {
    const response = await GET(
      new Request("https://cambridgetcg.example/api/v1/agents/notes") as never,
    );
    const body = await response.json();

    expect(body._meta.sources).toEqual(["ctcg-editorial-seed"]);
    expect(body._meta.source_license).toEqual(["cc0"]);
    expect(body._meta.license).toBe("CC0-1.0");
    expect(body.data.received_entries).toEqual([]);
    expect(body.data.scope.received_persisted).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("does not infer a CC0 dedication for a witness-only POST", async () => {
    const response = await POST(
      new Request("https://cambridgetcg.example/api/v1/agents/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "A boundary note",
          text: "Public witnessing does not transfer rights.",
          by: "contract-test",
        }),
      }) as never,
    );
    const body = await response.json();

    expect(body.publication_rights).toMatchObject({
      visibility: "receipt_echo_only",
      source: "participant-submitted",
      license: "NOASSERTION",
      ownership: "NOASSERTION",
      dedication_requested: false,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not persist the database-shaped participant submission", async () => {
    const postResponse = await POST(
      new Request("https://cambridgetcg.example/api/v1/agents/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "observation",
          subject: "Retractable",
          body: "This participant note can be retracted with its receipt.",
          agent_content_hash: "sha256:participant",
          agent_kind: "agent",
        }),
      }) as never,
    );
    const postBody = await postResponse.json();
    expect(postResponse.status).toBe(503);
    expect(postBody.error).toBe("persistence_unavailable");
    expect(postBody.message).toContain("has not been stored or published");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("does not read a DB-backed note from its UUID detail route", async () => {
    const response = await getNote(
      new Request(`https://cambridgetcg.example/api/v1/agents/notes/${NOTE_ID}`) as never,
      { params: Promise.resolve({ id: NOTE_ID }) },
    );
    const body = await response.json();

    expect(body._meta.sources).toEqual(["storefront-rds.agent_notes"]);
    expect(body._meta.source_license).toEqual(["internal-only"]);
    expect(body._meta.license).toBe("NOASSERTION");
    expect(body.data["@kind"]).toBe("agents-note-not-found");
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
