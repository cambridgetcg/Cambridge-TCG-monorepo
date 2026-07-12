import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("identity-verification privacy boundary", () => {
  it("fails closed for new details and document uploads", () => {
    const details = source("src/app/api/trust/verify/route.ts");
    expect(details).toContain('code: "verification_intake_paused"');
    expect(details).not.toContain("submitVerification");
    expect(details).not.toContain("fullLegalName");

    const documents = source("src/app/api/trust/verify/documents/route.ts");
    expect(documents).toContain('code: "verification_document_intake_paused"');
    expect(documents).not.toContain("getPresignedUploadUrl");
    expect(documents).not.toContain("addVerificationDocument");
  });

  it("does not return stored object URLs and deletes the object before its row", () => {
    const documents = source("src/app/api/trust/verify/documents/route.ts");
    expect(documents).toContain('access: "withheld_pending_private_storage"');
    expect(documents).not.toContain("url: document.url");
    expect(documents.indexOf("await deleteS3Object(document.s3_key)")).toBeLessThan(
      documents.indexOf("await deleteVerificationDocument(id, session.user.id)"),
    );
  });

  it("fails closed for dispute evidence and withholds stored public URLs", () => {
    const evidence = source("src/app/api/trust/disputes/[id]/evidence/route.ts");
    expect(evidence).toContain('code: "dispute_evidence_intake_paused"');
    expect(evidence).not.toContain("getPresignedUploadUrl");
    expect(evidence).not.toContain("addDisputeEvidence");
    expect(evidence).not.toContain("url: item.url");
  });
});
