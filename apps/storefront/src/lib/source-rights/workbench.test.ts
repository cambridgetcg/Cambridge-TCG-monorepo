import { describe, expect, it } from "vitest";
import {
  allowedSourceRightsTransition,
  buildSourceRightsArtifact,
  deployedRegistryHash,
  parseSourceRightsProposal,
  sourceRightsRevisionHash,
} from "./workbench";

const now = new Date("2026-07-12T12:00:00.000Z");

function validBody() {
  return {
    summary: "Review official display and image terms.",
    review_trigger: "Terms change, contract changes, or 2027 review date arrives.",
    valid_until: "2027-07-12",
    agreement_reference: "legal-register/2026/014",
    public_evidence: [
      { url: "https://example.com/terms", title: "Official terms", observed_at: "2026-07-10" },
      { url: "https://example.com/developer", title: "Official developer policy", observed_at: "2026-07-11" },
    ],
    cells: [
      {
        proposed_field_path: "card.image_url",
        purpose: "public-display",
        verdict: "conditional",
        conditions: "Only on the approved display surface with attribution.",
        attribution: "Source name and link",
        retention_days: 30,
      },
      {
        proposed_field_path: "card.name",
        purpose: "bulk-redistribution",
        verdict: "unknown",
      },
    ],
  };
}

describe("source-rights workbench proposal contract", () => {
  it("normalizes exact cells and hashes the deployed policy deterministically", () => {
    const content = parseSourceRightsProposal(validBody(), { sourceId: "scryfall", now });
    const artifact = buildSourceRightsArtifact({ sourceId: "scryfall", state: "draft", content });
    expect(artifact.authority).toBe("proposal-only");
    expect(artifact.authority_notice).toContain("does not grant runtime permission");
    expect(artifact.cells.map((cell) => cell.proposed_field_path)).toEqual([
      "card.image_url",
      "card.name",
    ]);
    expect(artifact.base_registry_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(deployedRegistryHash("scryfall")).toBe(artifact.base_registry_hash);
    expect(sourceRightsRevisionHash(artifact)).toMatch(/^[0-9a-f]{64}$/);
    expect(sourceRightsRevisionHash(artifact)).toBe(sourceRightsRevisionHash(artifact));
  });

  it("makes hash independent of evidence and cell input ordering", () => {
    const first = validBody();
    const second = validBody();
    second.public_evidence.reverse();
    second.cells.reverse();
    const a = buildSourceRightsArtifact({
      sourceId: "scryfall",
      state: "draft",
      content: parseSourceRightsProposal(first, { sourceId: "scryfall", now }),
    });
    const b = buildSourceRightsArtifact({
      sourceId: "scryfall",
      state: "draft",
      content: parseSourceRightsProposal(second, { sourceId: "scryfall", now }),
    });
    expect(sourceRightsRevisionHash(a)).toBe(sourceRightsRevisionHash(b));
  });

  it.each([
    ["wildcard", { cells: [{ proposed_field_path: "card.*", purpose: "public-display", verdict: "unknown" }] }],
    ["bracket", { cells: [{ proposed_field_path: "card[0].name", purpose: "public-display", verdict: "unknown" }] }],
    ["secret URL", { public_evidence: [{ url: "https://example.com/terms?token=secret", title: "Bad", observed_at: "2026-07-10" }] }],
    ["credential URL", { public_evidence: [{ url: "https://person:secret@example.com/terms", title: "Bad", observed_at: "2026-07-10" }] }],
    ["secret agreement", { agreement_reference: "Bearer secret-value" }],
    ["secret condition", { cells: [{ proposed_field_path: "card.name", purpose: "public-display", verdict: "conditional", conditions: "api_key=abcdef123456" }] }],
  ])("rejects %s input", (_label, override) => {
    expect(() => parseSourceRightsProposal({ ...validBody(), ...override }, { sourceId: "scryfall", now })).toThrow();
  });

  it("requires named conditions for conditional conclusions", () => {
    const body = validBody();
    body.cells[0].conditions = "";
    expect(() => parseSourceRightsProposal(body, { sourceId: "scryfall", now })).toThrow(/conditions/);
  });

  it("allows only append-only lifecycle transitions", () => {
    expect(allowedSourceRightsTransition("draft", "proposed")).toBe(true);
    expect(allowedSourceRightsTransition("draft", "rejected")).toBe(true);
    expect(allowedSourceRightsTransition("proposed", "rejected")).toBe(true);
    expect(allowedSourceRightsTransition("proposed", "landed")).toBe(true);
    expect(allowedSourceRightsTransition("draft", "landed")).toBe(false);
    expect(allowedSourceRightsTransition("landed", "draft")).toBe(false);
  });

  it("requires a full commit only for landed observations", () => {
    const content = parseSourceRightsProposal(validBody(), { sourceId: "scryfall", now });
    expect(() => buildSourceRightsArtifact({ sourceId: "scryfall", state: "landed", content })).toThrow(/commit SHA/);
    expect(() => buildSourceRightsArtifact({
      sourceId: "scryfall",
      state: "proposed",
      content,
      landedCommit: "a".repeat(40),
    })).toThrow(/Only a landed/);
  });

  it("requires a bounded, secret-free reason for a rejected revision", () => {
    const content = parseSourceRightsProposal(validBody(), { sourceId: "scryfall", now });
    expect(() => buildSourceRightsArtifact({ sourceId: "scryfall", state: "rejected", content })).toThrow(/reason/);
    const rejected = buildSourceRightsArtifact({
      sourceId: "scryfall",
      state: "rejected",
      content,
      decisionNote: "Public evidence does not cover redistribution.",
    });
    expect(rejected.decision_note).toBe("Public evidence does not cover redistribution.");
    expect(() => buildSourceRightsArtifact({
      sourceId: "scryfall",
      state: "rejected",
      content,
      decisionNote: "token=abcdef123456",
    })).toThrow(/secret/);
  });
});
