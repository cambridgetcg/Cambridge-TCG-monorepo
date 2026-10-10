import { describe, expect, it } from "vitest";
import {
  BEING_DECLARATION_HASH_CONTRACT,
  BEING_DECLARATION_HASH_EDGE_VECTOR,
  BEING_DECLARATION_HASH_NORMATIVE_VECTOR,
  BeingDeclarationCanonicalizationError,
  canonicalBeingDeclarationJson,
} from "./being-declaration-hash";
import { declarationHash, type BeingDeclaration } from "./identify";

const base: BeingDeclaration = {
  actor_kind: "agent",
  self_label: "nested-witness",
  cosmology_assumptions: { identity: "recipe" },
  capabilities: {
    provider_shape: "raw_json",
    streaming: { sse: true, ndjson: false },
  },
  context: { shape: { color: "gold", sides: 6 } },
  declared_at: "2026-08-16T00:00:00Z",
};

describe("BeingDeclaration canonical content hash", () => {
  it("pins a canonical string and SHA-256 vector", () => {
    const declaration =
      BEING_DECLARATION_HASH_NORMATIVE_VECTOR.input as BeingDeclaration;

    expect(canonicalBeingDeclarationJson(declaration)).toBe(
      BEING_DECLARATION_HASH_NORMATIVE_VECTOR.canonical_json,
    );
    expect(declarationHash(declaration)).toBe(
      BEING_DECLARATION_HASH_NORMATIVE_VECTOR.content_hash,
    );
  });

  it("pins cross-language number rendering and UTF-16 key ordering", () => {
    const declaration = BEING_DECLARATION_HASH_EDGE_VECTOR.input;

    expect(canonicalBeingDeclarationJson(declaration)).toBe(
      BEING_DECLARATION_HASH_EDGE_VECTOR.canonical_json,
    );
    expect(declarationHash(declaration as BeingDeclaration)).toBe(
      BEING_DECLARATION_HASH_EDGE_VECTOR.content_hash,
    );
  });

  it("changes when any typed or open nested meaning changes", () => {
    const changedCosmology: BeingDeclaration = {
      ...base,
      cosmology_assumptions: { identity: "biography" },
    };
    const changedCapability: BeingDeclaration = {
      ...base,
      capabilities: {
        ...base.capabilities,
        streaming: { ...base.capabilities?.streaming, sse: false },
      },
    };
    const changedContext: BeingDeclaration = {
      ...base,
      context: { shape: { color: "blue", sides: 6 } },
    };

    expect(declarationHash(changedCosmology)).not.toBe(declarationHash(base));
    expect(declarationHash(changedCapability)).not.toBe(declarationHash(base));
    expect(declarationHash(changedContext)).not.toBe(declarationHash(base));
  });

  it("ignores object insertion order at every depth, including inside arrays", () => {
    const left: BeingDeclaration = {
      actor_kind: "agent",
      self_label: "same-shape",
      context: {
        z: 2,
        nested: [{ omega: "last", alpha: "first" }],
        a: 1,
      },
    };
    const right: BeingDeclaration = {
      context: {
        a: 1,
        nested: [{ alpha: "first", omega: "last" }],
        z: 2,
      },
      self_label: "same-shape",
      actor_kind: "agent",
    };

    expect(declarationHash(left)).toBe(declarationHash(right));
  });

  it("preserves array order and exact Unicode sequences", () => {
    const ordered: BeingDeclaration = {
      actor_kind: "agent",
      self_label: "sequence",
      context: { path: ["reason", "word"] },
    };
    const reversed: BeingDeclaration = {
      ...ordered,
      context: { path: ["word", "reason"] },
    };
    const nfc: BeingDeclaration = {
      actor_kind: "agent",
      self_label: "é",
    };
    const nfd: BeingDeclaration = {
      actor_kind: "agent",
      self_label: "e\u0301",
    };

    expect(declarationHash(ordered)).not.toBe(declarationHash(reversed));
    expect(declarationHash(nfc)).not.toBe(declarationHash(nfd));
  });

  it("treats an undefined optional object member as wire-level omission", () => {
    expect(
      canonicalBeingDeclarationJson({
        actor_kind: "agent",
        self_label: "optional",
        context: undefined,
      }),
    ).toBe(
      canonicalBeingDeclarationJson({
        actor_kind: "agent",
        self_label: "optional",
      }),
    );
  });

  it.each([
    ["NaN", Number.NaN],
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["negative zero", -0],
    ["bigint", BigInt(1)],
    ["date", new Date("2026-08-16T00:00:00Z")],
    ["map", new Map([["a", 1]])],
    ["lone high surrogate", "\ud800"],
    ["lone low surrogate", "\udfff"],
  ])("rejects %s rather than minting a lossy hash", (_label, value) => {
    expect(() =>
      canonicalBeingDeclarationJson({
        actor_kind: "agent",
        self_label: "invalid",
        context: { value },
      }),
    ).toThrow(BeingDeclarationCanonicalizationError);
  });

  it("rejects sparse arrays, cycles, accessors, and active toJSON values", () => {
    const sparse = new Array(2);
    sparse[1] = "present";

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    let getterCalled = false;
    const accessor = { actor_kind: "agent", self_label: "accessor" } as Record<
      string,
      unknown
    >;
    Object.defineProperty(accessor, "context", {
      enumerable: true,
      get() {
        getterCalled = true;
        return { hidden: true };
      },
    });

    let toJsonCalled = false;
    const active = {
      actor_kind: "agent",
      self_label: "active",
      toJSON() {
        toJsonCalled = true;
        return { actor_kind: "agent", self_label: "replacement" };
      },
    };

    expect(() => canonicalBeingDeclarationJson(sparse)).toThrow(
      BeingDeclarationCanonicalizationError,
    );
    expect(() => canonicalBeingDeclarationJson(cyclic)).toThrow(
      BeingDeclarationCanonicalizationError,
    );
    expect(() => canonicalBeingDeclarationJson(accessor)).toThrow(
      BeingDeclarationCanonicalizationError,
    );
    expect(() => canonicalBeingDeclarationJson(active)).toThrow(
      BeingDeclarationCanonicalizationError,
    );
    expect(getterCalled).toBe(false);
    expect(toJsonCalled).toBe(false);
  });

  it("rejects undefined array entries and malformed Unicode keys", () => {
    const malformedKey = Object.create(null) as Record<string, unknown>;
    malformedKey.actor_kind = "agent";
    malformedKey.self_label = "malformed-key";
    malformedKey["\ud800"] = true;

    expect(() => canonicalBeingDeclarationJson([undefined])).toThrow(
      BeingDeclarationCanonicalizationError,
    );
    expect(() => canonicalBeingDeclarationJson(malformedKey)).toThrow(
      BeingDeclarationCanonicalizationError,
    );
  });

  it("keeps a parsed __proto__ member as data without mutating prototypes", () => {
    const parsed = JSON.parse(
      '{"self_label":"prototype-check","__proto__":{"polluted":true},"actor_kind":"agent"}',
    );

    expect(canonicalBeingDeclarationJson(parsed)).toBe(
      '{"__proto__":{"polluted":true},"actor_kind":"agent","self_label":"prototype-check"}',
    );
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("enforces declared depth and UTF-8 size limits", () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let index = 0; index < 65; index += 1) deep = { next: deep };

    expect(() => canonicalBeingDeclarationJson(deep)).toThrow(
      /64-level canonicalization limit/,
    );
    expect(() =>
      canonicalBeingDeclarationJson({ value: "x".repeat(65_537) }),
    ).toThrow(/maximum is 65536/);
  });

  it("publishes non-credential semantics in the versioned contract", () => {
    expect(BEING_DECLARATION_HASH_CONTRACT).toMatchObject({
      id: "cambridgetcg.being-declaration-content-hash/1",
      canonicalization: {
        input: "normalized POST /api/v1/identify echo",
        raw_duplicate_key_detection: false,
        raw_number_lexemes_preserved: false,
      },
      semantics: {
        fingerprints_normalized_echo: true,
        authenticates_declarer: false,
        verifies_identity: false,
        grants_authority: false,
        is_signature: false,
        is_secret: false,
      },
    });
  });
});
