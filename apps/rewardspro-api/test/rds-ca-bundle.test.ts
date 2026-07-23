import { createHash, X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const EXPECTED_SHA256 =
  "17c557502061c4879b844fff983288a2fb07d520f4cf2a5de60f5cda800a4494";

describe("packaged RDS trust bundle", () => {
  it("matches the reviewed eu-west-2 roots byte for byte", () => {
    const bundle = readFileSync(
      new URL("../certs/eu-west-2-bundle.pem", import.meta.url),
    );
    expect(createHash("sha256").update(bundle).digest("hex")).toBe(
      EXPECTED_SHA256,
    );

    const certificates =
      bundle
        .toString("utf8")
        .match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ??
      [];
    expect(certificates).toHaveLength(3);
    for (const pem of certificates) {
      const certificate = new X509Certificate(pem);
      expect(certificate.subject).toContain("O=Amazon Web Services\\, Inc.");
      expect(certificate.subject).toContain("CN=Amazon RDS eu-west-2 Root CA");
      expect(certificate.ca).toBe(true);
    }
  });
});
