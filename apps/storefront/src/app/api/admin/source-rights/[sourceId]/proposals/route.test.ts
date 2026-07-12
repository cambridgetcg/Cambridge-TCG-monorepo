import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminMock, createDraftMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  createDraftMock: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/source-rights/workbench-db", () => ({ createSourceRightsDraft: createDraftMock }));

import { SourceRightsInputError } from "@/lib/source-rights/workbench";
import { POST } from "./route";

const params = { params: Promise.resolve({ sourceId: "scryfall" }) };

function request(body: unknown, origin = "https://cambridgetcg.com") {
  return new Request("https://cambridgetcg.com/api/admin/source-rights/scryfall/proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}

describe("source-rights proposal API", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    createDraftMock.mockReset();
    requireAdminMock.mockResolvedValue({ id: "admin-1", email: "operator@example.com", role: "admin" });
  });

  it("denies before reading or persisting when the caller is not an admin", async () => {
    requireAdminMock.mockResolvedValue(null);
    const response = await POST(request({ secret: "must not be read" }), params);
    expect(response.status).toBe(403);
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  it("requires same-origin mutation", async () => {
    const response = await POST(request({}, "https://attacker.example"), params);
    expect(response.status).toBe(403);
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  it("returns validation detail without recording a receipt", async () => {
    createDraftMock.mockRejectedValue(new SourceRightsInputError("Wildcards are not allowed."));
    const response = await POST(request({ cells: [] }), params);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Wildcards");
  });

  it("returns a non-effective draft with the ledger as its sole bounded actor record", async () => {
    createDraftMock.mockResolvedValue({
      id: "review-1",
      source_id: "scryfall",
      state: "draft",
      revision_hash: "a".repeat(64),
      cells: [{ proposed_field_path: "card.name" }],
    });
    const response = await POST(request({ summary: "private review wording" }), params);
    expect(response.status).toBe(201);
    expect(createDraftMock).toHaveBeenCalledWith(expect.objectContaining({ sourceId: "scryfall", createdBy: "admin-1" }));
  });
});
