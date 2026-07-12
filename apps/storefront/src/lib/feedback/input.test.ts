import { describe, expect, it } from "vitest";
import { parseFeedbackInput } from "./input";

describe("parseFeedbackInput", () => {
  it("keeps only the documented general fields and separates contact", () => {
    const result = parseFeedbackInput({
      kind: "general",
      message: "  Please correct this listing.  ",
      topic: "directory",
      listing: "cambridge-card-club",
      name: "  A collector  ",
      reporter_contact: "collector@example.com",
    });

    expect(result).toEqual({
      ok: true,
      kind: "general",
      reporterContact: "collector@example.com",
      storedBody: {
        kind: "general",
        message: "Please correct this listing.",
        name: "A collector",
        topic: "directory",
        listing: "cambridge-card-club",
      },
    });
    if (result.ok) {
      expect(result.storedBody).not.toHaveProperty("reporter_contact");
    }
  });

  it("rejects undeclared fields instead of retaining arbitrary JSON", () => {
    const result = parseFeedbackInput({
      kind: "general",
      message: "hello",
      private_notes: "should not be stored",
    });

    expect(result).toEqual({
      ok: false,
      message: "Unsupported field for kind 'general': private_notes.",
    });
  });

  it("enforces field limits", () => {
    const result = parseFeedbackInput({
      kind: "general",
      message: "x".repeat(5001),
    });

    expect(result).toEqual({
      ok: false,
      message: "message must be 5000 characters or fewer.",
    });
  });

  it("requires a safe reply address for the two reply-dependent kinds", () => {
    const missing = parseFeedbackInput({
      kind: "contract-drift",
      endpoint: "/api/v1/cards/example",
      observed: "one shape",
      expected: "another shape",
    });
    const credentialUrl = parseFeedbackInput({
      kind: "federation-adopter",
      platform_name: "Example",
      platform_url: "https://example.com",
      federation_endpoint: "https://example.com/api/federation",
      reporter_contact: "https://user:secret@example.com/contact",
    });

    expect(missing).toEqual({
      ok: false,
      message: "reporter_contact is required.",
    });
    expect(credentialUrl).toEqual({
      ok: false,
      message: "reporter_contact must be an email address or an HTTPS URL without credentials.",
    });
  });

  it("rejects malformed directory identifiers", () => {
    const result = parseFeedbackInput({
      kind: "general",
      message: "wrong record",
      topic: "directory",
      listing: "../../private",
    });

    expect(result).toEqual({
      ok: false,
      message: "listing must be a 3-48 character organisation slug.",
    });
  });
});
