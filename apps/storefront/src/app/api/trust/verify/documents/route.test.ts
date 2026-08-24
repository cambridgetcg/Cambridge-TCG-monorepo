import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  isAdmin: vi.fn(),
  add: vi.fn(),
  list: vi.fn(),
  getOwned: vi.fn(),
  deleteRow: vi.fn(),
  presignUpload: vi.fn(),
  presignRead: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/admin/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/trust/db", () => ({
  addVerificationDocument: mocks.add,
  listVerificationDocuments: mocks.list,
  getOwnedVerificationDocument: mocks.getOwned,
  deleteVerificationDocument: mocks.deleteRow,
}));
vi.mock("@/lib/auction/s3", () => ({
  deleteS3Object: mocks.deleteObject,
  getPresignedReadUrl: mocks.presignRead,
  getPresignedUploadUrl: mocks.presignUpload,
  getStoredObjectUrl: (key: string) => `https://private-bucket.example/${key}`,
  isOwnedUploadKey: (key: string, namespace: string, userId: string) =>
    key.startsWith(`${namespace}/${userId}/`) && !key.includes("..") && !key.includes("\\"),
}));

const USER_ID = "123e4567-e89b-42d3-a456-426614174099";
const DOC_ID = "123e4567-e89b-42d3-a456-426614174001";
const KEY = `verifications/${USER_ID}/proof.jpg`;
const document = {
  id: DOC_ID,
  user_id: USER_ID,
  doc_type: "passport",
  url: `https://private-bucket.example/${KEY}`,
  s3_key: KEY,
  mime_type: "image/jpeg",
  uploaded_at: "2026-08-24T00:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("IDENTITY_VERIFICATION_MODE", "reviewed-private-storage");
  mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
  mocks.isAdmin.mockResolvedValue(false);
  mocks.list.mockResolvedValue([document]);
  mocks.presignRead.mockResolvedValue("https://signed.example/read?expires=300");
  mocks.getOwned.mockResolvedValue(document);
  mocks.deleteRow.mockResolvedValue(true);
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.add.mockImplementation(async (_userId: string, value: Record<string, unknown>) => ({
    ...document,
    ...value,
    s3_key: value.s3Key,
    doc_type: value.docType,
    mime_type: value.mimeType,
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("identity-document privacy boundary", () => {
  it("returns only a short-lived authorized read URL, not storage provenance", async () => {
    const response = await GET(new Request("https://cambridgetcg.com/api/trust/verify/documents"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(mocks.presignRead).toHaveBeenCalledWith(KEY);
    expect(body.documents).toEqual([{
      id: DOC_ID,
      doc_type: "passport",
      mime_type: "image/jpeg",
      uploaded_at: "2026-08-24T00:00:00.000Z",
      url: "https://signed.example/read?expires=300",
      access_status: "available",
    }]);
    expect(JSON.stringify(body)).not.toContain("s3_key");
    expect(JSON.stringify(body)).not.toContain(USER_ID);
    expect(JSON.stringify(body)).not.toContain("private-bucket.example");
  });

  it("never signs a legacy key outside the participant namespace", async () => {
    mocks.list.mockResolvedValueOnce([
      {
        ...document,
        s3_key: "verifications/someone-else/proof.jpg",
        url: "https://private-bucket.example/verifications/someone-else/proof.jpg",
      },
    ]);

    const response = await GET(
      new Request("https://cambridgetcg.com/api/trust/verify/documents"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.presignRead).not.toHaveBeenCalled();
    expect(body.documents).toEqual([
      {
        id: DOC_ID,
        doc_type: "passport",
        mime_type: "image/jpeg",
        uploaded_at: "2026-08-24T00:00:00.000Z",
        url: null,
        access_status: "support_required",
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("s3_key");
    expect(JSON.stringify(body)).not.toContain("someone-else");
  });

  it("validates an admin read against the target participant, not the admin", async () => {
    const adminUserId = "123e4567-e89b-42d3-a456-426614174088";
    mocks.auth.mockResolvedValueOnce({ user: { id: adminUserId } });
    mocks.isAdmin.mockResolvedValueOnce(true);

    const response = await GET(
      new Request(
        `https://cambridgetcg.com/api/trust/verify/documents?user_id=${USER_ID}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.presignRead).toHaveBeenCalledWith(KEY);
    expect((await response.json()).documents[0]).toMatchObject({
      url: "https://signed.example/read?expires=300",
      access_status: "available",
    });
  });

  it("does not sign a row whose recorded owner disagrees with the query owner", async () => {
    mocks.list.mockResolvedValueOnce([
      {
        ...document,
        user_id: "123e4567-e89b-42d3-a456-426614174077",
      },
    ]);

    const response = await GET(
      new Request("https://cambridgetcg.com/api/trust/verify/documents"),
    );

    expect(response.status).toBe(200);
    expect(mocks.presignRead).not.toHaveBeenCalled();
    expect((await response.json()).documents[0]).toMatchObject({
      url: null,
      access_status: "support_required",
    });
  });

  it("rejects a key outside the authenticated participant namespace", async () => {
    const response = await POST(new Request("https://cambridgetcg.com/api/trust/verify/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        s3Key: "verifications/someone-else/proof.jpg",
        url: "https://attacker.example/proof.jpg",
        docType: "passport",
        mimeType: "image/jpeg",
      }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("pauses new document uploads without blocking reads or deletion", async () => {
    vi.stubEnv("IDENTITY_VERIFICATION_MODE", "disabled");
    const response = await POST(new Request("https://cambridgetcg.com/api/trust/verify/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentType: "image/jpeg" }),
    }));

    expect(response.status).toBe(503);
    expect(mocks.presignUpload).not.toHaveBeenCalled();
  });

  it("derives the stored address and presents a signed URL", async () => {
    const response = await POST(new Request("https://cambridgetcg.com/api/trust/verify/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        s3Key: KEY,
        url: "https://attacker.example/ignored.jpg",
        docType: "passport",
        mimeType: "image/jpeg",
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.add).toHaveBeenCalledWith(USER_ID, {
      docType: "passport",
      url: `https://private-bucket.example/${KEY}`,
      s3Key: KEY,
      mimeType: "image/jpeg",
    });
    expect((await response.json()).document.url).toContain("signed.example");
  });

  it("keeps the database record when object deletion fails", async () => {
    mocks.deleteObject.mockRejectedValueOnce(new Error("S3 unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await DELETE(new Request(
      `https://cambridgetcg.com/api/trust/verify/documents?id=${DOC_ID}`,
      { method: "DELETE" },
    ));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.deleteRow).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("deletes the owned S3 object before its database record", async () => {
    const order: string[] = [];
    mocks.deleteObject.mockImplementationOnce(async () => { order.push("object"); });
    mocks.deleteRow.mockImplementationOnce(async () => { order.push("row"); return true; });

    const response = await DELETE(new Request(
      `https://cambridgetcg.com/api/trust/verify/documents?id=${DOC_ID}`,
      { method: "DELETE" },
    ));

    expect(response.status).toBe(200);
    expect(order).toEqual(["object", "row"]);
    expect(mocks.deleteRow).toHaveBeenCalledWith(DOC_ID, USER_ID, KEY);
  });
});
