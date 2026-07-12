import { describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import Ajv2020 from "ajv/dist/2020.js";
import vectors from "../fixtures/answering-rhyme-statement-vectors.json";
import statementSchema from "../schema/answering-rhyme.statement.v1.schema.json";
import {
  ANSWERING_RHYME_STATEMENT_LIMITS,
  answeringRhymeStatementContentHash,
  canonicalAnsweringRhymeStatement,
  canonicalAnsweringRhymeStatementBytes,
  checkAnsweringRhymeStatementHash,
  isNormalizedAnsweringRhymeStatement,
  prepareAnsweringRhymeStatement,
  validateAnsweringRhymeStatement,
} from "../src/index.js";

const BASE_INPUT = vectors.vectors[0]!.input;

describe("answering-rhyme.statement/1 conformance core", () => {
  it("publishes a schema for every normalized normative statement", () => {
    const validate = new Ajv2020({ strict: true }).compile(statementSchema);
    for (const vector of vectors.vectors) {
      expect(validate(vector.normalized), JSON.stringify(validate.errors)).toBe(
        true,
      );
    }
    expect(
      validate({ ...vectors.vectors[0]!.normalized, surprise: true }),
    ).toBe(false);
  });

  it.each(vectors.vectors)(
    "matches normative bytes and hash: $name",
    async (vector) => {
      const validation = validateAnsweringRhymeStatement(vector.input);
      expect(validation.ok).toBe(true);
      if (!validation.ok) return;

      expect(validation.value).toEqual(vector.normalized);
      expect(canonicalAnsweringRhymeStatement(validation.value)).toBe(
        vector.canonical_json,
      );
      expect(
        new TextDecoder().decode(
          canonicalAnsweringRhymeStatementBytes(validation.value),
        ),
      ).toBe(vector.canonical_json);
      await expect(
        answeringRhymeStatementContentHash(validation.value),
      ).resolves.toBe(vector.content_hash);
      await expect(
        checkAnsweringRhymeStatementHash(
          validation.value,
          vector.content_hash as `sha256:${string}`,
        ),
      ).resolves.toBe(true);
    },
  );

  it("is idempotent and independent of input key order", () => {
    const permuted = Object.fromEntries(
      Object.entries(BASE_INPUT).reverse(),
    ) as Record<string, unknown>;
    permuted.declared_by = Object.fromEntries(
      Object.entries(BASE_INPUT.declared_by).reverse(),
    );

    const first = validateAnsweringRhymeStatement(permuted);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = validateAnsweringRhymeStatement(first.value);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value).toEqual(first.value);
  });

  it("refuses to hash or canonicalize an unnormalized structural lookalike", async () => {
    const lookalike = vectors.vectors[1]!.input as never;
    expect(() => canonicalAnsweringRhymeStatement(lookalike)).toThrow(
      /normalized value returned by validate/i,
    );
    await expect(answeringRhymeStatementContentHash(lookalike)).rejects.toThrow(
      /normalized value returned by validate/i,
    );
  });

  it("rejects malformed output from an injected digest provider", async () => {
    const validation = validateAnsweringRhymeStatement(BASE_INPUT);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    await expect(
      answeringRhymeStatementContentHash(validation.value, {
        async digest(_algorithm, data) {
          expect(data).toBeInstanceOf(ArrayBuffer);
          return new ArrayBuffer(31);
        },
      }),
    ).rejects.toThrow(/expected exactly 32/i);

    await expect(
      answeringRhymeStatementContentHash(validation.value, {
        async digest() {
          return { byteLength: 32 } as ArrayBuffer;
        },
      }),
    ).rejects.toThrow(/did not return an ArrayBuffer/i);
  });

  it("accepts a genuine ArrayBuffer returned from another JavaScript realm", async () => {
    const validation = validateAnsweringRhymeStatement(BASE_INPUT);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const foreignDigest = runInNewContext("new ArrayBuffer(32)") as ArrayBuffer;
    expect(foreignDigest).not.toBeInstanceOf(ArrayBuffer);
    await expect(
      answeringRhymeStatementContentHash(validation.value, {
        async digest() {
          return foreignDigest;
        },
      }),
    ).resolves.toBe(`sha256:${"00".repeat(32)}`);
  });

  it("keeps the normalized brand true by freezing the complete statement", async () => {
    const validation = validateAnsweringRhymeStatement(BASE_INPUT);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const originalHash = await answeringRhymeStatementContentHash(
      validation.value,
    );
    expect(Object.isFrozen(validation.value)).toBe(true);
    expect(Object.isFrozen(validation.value.declared_by)).toBe(true);
    expect(Object.isFrozen(validation.value.evidence_urls)).toBe(true);
    expect(() => {
      (validation.value as { body: string }).body = "mutated after validation";
    }).toThrow(TypeError);
    expect(() => {
      (validation.value.declared_by as { label: string }).label =
        "mutated identity label";
    }).toThrow(TypeError);
    expect(() => {
      (validation.value.evidence_urls as string[]).push(
        "https://example.com/unsorted",
      );
    }).toThrow(TypeError);
    await expect(
      answeringRhymeStatementContentHash(validation.value),
    ).resolves.toBe(originalHash);
  });

  it("requires revalidation after serialization removes the runtime brand", () => {
    const validation = validateAnsweringRhymeStatement(BASE_INPUT);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const roundTripped = JSON.parse(
      JSON.stringify(validation.value),
    ) as unknown;
    expect(isNormalizedAnsweringRhymeStatement(roundTripped)).toBe(false);
    expect(() => canonicalAnsweringRhymeStatement(roundTripped as never)).toThrow(
      /normalized value returned by validate/i,
    );

    const revalidated = validateAnsweringRhymeStatement(roundTripped);
    expect(revalidated.ok).toBe(true);
    if (revalidated.ok) {
      expect(isNormalizedAnsweringRhymeStatement(revalidated.value)).toBe(true);
    }
  });

  it("prepares a frozen statement without network or ambient credentials", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("prepare must not fetch"));
    try {
      const prepared = await prepareAnsweringRhymeStatement(BASE_INPUT);
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(Object.isFrozen(prepared.value.statement)).toBe(true);
      expect(Object.isFrozen(prepared.value.statement.declared_by)).toBe(true);
      expect(Object.isFrozen(prepared.value.statement.evidence_urls)).toBe(
        true,
      );
      expect(prepared.value.contentHash).toBe(vectors.vectors[0]!.content_hash);
      expect(prepared.value.canonicalBytesLength).toBe(
        prepared.value.canonicalBytes.byteLength,
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("does not confuse canonical expansion with the raw transport limit", async () => {
    const requestByteLimit = ANSWERING_RHYME_STATEMENT_LIMITS.request_bytes;
    const longUrl = (prefix: string, index: number) =>
      `https://${prefix}.example/${index}/${"😀".repeat(80)}`;
    const input = {
      ...BASE_INPUT,
      evidence_urls: Array.from({ length: 12 }, (_, index) =>
        longUrl("evidence", index),
      ),
      authority_evidence_urls: Array.from({ length: 12 }, (_, index) =>
        longUrl("authority", index),
      ),
    };
    expect(
      new TextEncoder().encode(JSON.stringify(input)).byteLength,
    ).toBeLessThan(requestByteLimit);
    const prepared = await prepareAnsweringRhymeStatement({
      ...input,
    });
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.value.canonicalBytesLength).toBeGreaterThan(
        requestByteLimit,
      );
    }
  });

  it("locks Unicode, time, control, and URL boundaries", () => {
    const accepted = validateAnsweringRhymeStatement({
      ...BASE_INPUT,
      body: "line one\r\nline two 😀",
      declared_at: "2024-02-29T23:59:59.123456789+01:30",
      evidence_urls: [
        "https://EXAMPLE.com:443/a/../b",
        "https://example.com/b",
      ],
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.value.body).toBe("line one\nline two 😀");
      expect(accepted.value.declared_at).toBe("2024-02-29T22:29:59.123Z");
      expect(accepted.value.evidence_urls).toEqual(["https://example.com/b"]);
      expect(canonicalAnsweringRhymeStatement(accepted.value)).toContain("😀");
    }

    const normalizedPriorHash = validateAnsweringRhymeStatement({
      ...BASE_INPUT,
      in_response_to: ` SHA256:${"A".repeat(64)} `,
    });
    expect(normalizedPriorHash.ok).toBe(true);
    if (normalizedPriorHash.ok) {
      expect(normalizedPriorHash.value.in_response_to).toBe(
        `sha256:${"a".repeat(64)}`,
      );
    }

    for (const input of [
      { ...BASE_INPUT, declared_at: "2026-02-30T12:00:00Z" },
      { ...BASE_INPUT, declared_at: "2026-01-01T00:00:00.1234567890Z" },
      { ...BASE_INPUT, declared_at: "0001-01-01T00:00:00+23:00" },
      { ...BASE_INPUT, declared_at: "9999-12-31T23:59:59-23:59" },
      { ...BASE_INPUT, body: "unpaired high surrogate \ud800" },
      { ...BASE_INPUT, body: "unpaired low surrogate \udfff" },
      { ...BASE_INPUT, relation_key: "unsafe\nkey" },
      {
        ...BASE_INPUT,
        declared_by: {
          ...BASE_INPUT.declared_by,
          canonical_url: "https://example.com/has a space",
        },
      },
    ]) {
      expect(validateAnsweringRhymeStatement(input).ok).toBe(false);
    }
  });

  it("counts Unicode scalars and URL-list items at shared limits", () => {
    expect(
      validateAnsweringRhymeStatement({
        ...BASE_INPUT,
        declared_by: { ...BASE_INPUT.declared_by, label: "😀".repeat(160) },
      }).ok,
    ).toBe(true);
    expect(
      validateAnsweringRhymeStatement({
        ...BASE_INPUT,
        declared_by: { ...BASE_INPUT.declared_by, label: "😀".repeat(161) },
      }).ok,
    ).toBe(false);
    expect(
      validateAnsweringRhymeStatement({
        ...BASE_INPUT,
        evidence_urls: Array.from(
          { length: ANSWERING_RHYME_STATEMENT_LIMITS.urls_per_list + 1 },
          (_, index) => `https://evidence.example/${index}`,
        ),
      }).ok,
    ).toBe(false);
  });
});
