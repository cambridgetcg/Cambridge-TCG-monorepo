import { describe, expect, it } from "vitest";
import {
  isBoundedCredentialPassword,
  MAX_CREDENTIAL_EMAIL_LENGTH,
  MAX_CREDENTIAL_PASSWORD_LENGTH,
  normalizeCredentialEmail,
} from "./credential-input";

describe("credential input", () => {
  it("normalizes a bounded email address", () => {
    expect(normalizeCredentialEmail("  Person@Example.COM ")).toBe(
      "person@example.com",
    );
  });

  it.each([
    null,
    42,
    "",
    "missing-at.example",
    "two@@example.com",
    "person@",
    `person@${"x".repeat(MAX_CREDENTIAL_EMAIL_LENGTH)}`,
  ])("rejects invalid or unbounded email input: %s", (input) => {
    expect(normalizeCredentialEmail(input)).toBeNull();
  });

  it("bounds password work without logging or storing the input", () => {
    expect(isBoundedCredentialPassword("correct horse battery staple")).toBe(
      true,
    );
    expect(isBoundedCredentialPassword("")).toBe(false);
    expect(
      isBoundedCredentialPassword(
        "x".repeat(MAX_CREDENTIAL_PASSWORD_LENGTH + 1),
      ),
    ).toBe(false);
  });
});
