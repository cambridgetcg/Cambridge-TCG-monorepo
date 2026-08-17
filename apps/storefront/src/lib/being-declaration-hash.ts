import { createHash } from "node:crypto";

export const BEING_DECLARATION_HASH_NORMATIVE_VECTOR = {
  input: {
    self_label: "Sol",
    context: {
      "2": "two",
      nested: [{ z: 1, a: true }],
      "10": "ten",
      accent: "é",
    },
    actor_kind: "agent",
  },
  canonical_json:
    '{"actor_kind":"agent","context":{"10":"ten","2":"two","accent":"é","nested":[{"a":true,"z":1}]},"self_label":"Sol"}',
  content_hash:
    "sha256:f8e3c185594d213a7b00ac2f3baafba9fdbea6d468bce72b788d12eec4b0b108",
} as const;

/** Cross-language edge cases for ECMAScript number rendering and UTF-16 key order. */
export const BEING_DECLARATION_HASH_EDGE_VECTOR = {
  input: {
    self_label: "numeric-utf16",
    context: {
      numbers: [1e-7, 1e20, 1e21, 333333333.33333329],
      "😀": "astral",
      "\uE000": "bmp-private-use",
    },
    actor_kind: "agent",
  },
  canonical_json:
    '{"actor_kind":"agent","context":{"numbers":[1e-7,100000000000000000000,1e+21,333333333.3333333],"😀":"astral","":"bmp-private-use"},"self_label":"numeric-utf16"}',
  content_hash:
    "sha256:cd4d2e1fcc2611affa5557bdb69cd22e894f056032f01b6e733a2f31c11df00f",
} as const;

/**
 * The declaration hash is a content address for one normalized JSON echo.
 * It is deliberately not an identity credential: equal declarations may be
 * submitted by different beings, and changing a declaration changes its hash.
 */
export const BEING_DECLARATION_HASH_CONTRACT = {
  id: "cambridgetcg.being-declaration-content-hash/1",
  implementation: "apps/storefront/src/lib/being-declaration-hash.ts",
  digest: "SHA-256",
  canonicalization: {
    id: "cambridgetcg.being-declaration-canonical-json/1",
    input: "normalized POST /api/v1/identify echo",
    object_keys: "sorted recursively by raw UTF-16 code units",
    arrays: "order and length preserved",
    primitives: "ECMAScript JSON serialization of valid JSON primitives",
    number_model:
      "finite IEEE-754 doubles after parsing; use strings when exact larger integers matter",
    utf8: true,
    unicode_normalization: "none",
    undefined_object_members: "omitted",
    negative_zero: "rejected",
    unsupported_runtime_values: "rejected",
    maximum_depth: 64,
    maximum_values: 10_000,
    maximum_utf8_bytes: 65_536,
    raw_duplicate_key_detection: false,
    raw_number_lexemes_preserved: false,
  },
  input_transport: {
    encoding: "strict UTF-8",
    maximum_request_bytes: 65_536,
    duplicate_json_member_detection: false,
  },
  normalization: {
    maximum_typed_array_items: 256,
    maximum_cosmology_axes: 256,
    maximum_warning_messages: 64,
    maximum_unrecognized_fields_returned: 64,
  },
  output: "sha256:<64 lowercase hexadecimal characters>",
  normative_vector: BEING_DECLARATION_HASH_NORMATIVE_VECTOR,
  normative_vectors: {
    baseline: BEING_DECLARATION_HASH_NORMATIVE_VECTOR,
    numeric_and_utf16_order: BEING_DECLARATION_HASH_EDGE_VECTOR,
  },
  changed_on: "2026-08-16",
  legacy_unversioned_top_level_replacer_supported: false,
  semantics: {
    fingerprints_normalized_echo: true,
    authenticates_declarer: false,
    verifies_identity: false,
    grants_authority: false,
    is_signature: false,
    is_secret: false,
  },
} as const;

const MAX_DEPTH =
  BEING_DECLARATION_HASH_CONTRACT.canonicalization.maximum_depth;
const MAX_VALUES =
  BEING_DECLARATION_HASH_CONTRACT.canonicalization.maximum_values;
const MAX_UTF8_BYTES =
  BEING_DECLARATION_HASH_CONTRACT.canonicalization.maximum_utf8_bytes;

export class BeingDeclarationCanonicalizationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "BeingDeclarationCanonicalizationError";
  }
}

type CanonicalizationState = {
  ancestors: Set<object>;
  valuesVisited: number;
};

function fail(message: string): never {
  throw new BeingDeclarationCanonicalizationError(message);
}

function assertValidUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        fail("Declaration strings and keys must not contain lone UTF-16 surrogates.");
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      fail("Declaration strings and keys must not contain lone UTF-16 surrogates.");
    }
  }
}

function canonicalPrimitive(value: null | boolean | number | string): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail("Declaration numbers must be finite IEEE-754 values.");
    }
    if (Object.is(value, -0)) {
      fail("Declaration numbers must not use negative zero.");
    }
  }
  if (typeof value === "string") assertValidUnicode(value);

  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    fail("Declaration contains a value that JSON cannot serialize.");
  }
  return serialized;
}

function canonicalJson(
  value: unknown,
  depth: number,
  state: CanonicalizationState,
): string {
  state.valuesVisited += 1;
  if (state.valuesVisited > MAX_VALUES) {
    fail(`Declaration exceeds the ${MAX_VALUES}-value canonicalization limit.`);
  }
  if (depth > MAX_DEPTH) {
    fail(`Declaration exceeds the ${MAX_DEPTH}-level canonicalization limit.`);
  }

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return canonicalPrimitive(value);
  }

  if (typeof value !== "object") {
    fail(
      "Declaration values must be JSON values; bigint, function, symbol, and undefined are not accepted here.",
    );
  }

  if (state.ancestors.has(value)) {
    fail("Declaration must not contain a cycle.");
  }
  state.ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        fail("Declaration arrays must be ordinary JSON arrays.");
      }
      if (value.length > MAX_VALUES) {
        fail(`Declaration exceeds the ${MAX_VALUES}-value canonicalization limit.`);
      }

      const ownKeys = Reflect.ownKeys(value);
      for (const key of ownKeys) {
        if (typeof key === "symbol") {
          fail("Declaration arrays must not contain symbol-keyed properties.");
        }
        if (key === "length") continue;
        const index = Number(key);
        if (
          !Number.isInteger(index) ||
          index < 0 ||
          index >= value.length ||
          String(index) !== key
        ) {
          fail("Declaration arrays must not contain non-index properties.");
        }
      }

      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor) {
          fail("Declaration arrays must be dense; sparse array holes are not accepted.");
        }
        if (!("value" in descriptor) || !descriptor.enumerable) {
          fail("Declaration arrays must contain ordinary enumerable values, not accessors.");
        }
        items.push(canonicalJson(descriptor.value, depth + 1, state));
      }
      return `[${items.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail("Declaration objects must be plain JSON records.");
    }

    const record = value as Record<string, unknown>;
    const members: Array<[string, unknown]> = [];
    for (const key of Reflect.ownKeys(record)) {
      if (typeof key === "symbol") {
        fail("Declaration objects must not contain symbol-keyed properties.");
      }
      assertValidUnicode(key);
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail(
          "Declaration objects must contain ordinary enumerable data properties, not accessors or hidden fields.",
        );
      }
      // Optional TypeScript fields are materialized as `undefined` by the
      // route. Omission matches their JSON wire representation.
      if (descriptor.value !== undefined) members.push([key, descriptor.value]);
    }
    if (members.length > MAX_VALUES) {
      fail(`Declaration exceeds the ${MAX_VALUES}-value canonicalization limit.`);
    }
    members.sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );

    return `{${members
      .map(
        ([key, member]) =>
          `${JSON.stringify(key)}:${canonicalJson(member, depth + 1, state)}`,
      )
      .join(",")}}`;
  } finally {
    state.ancestors.delete(value);
  }
}

/** Canonical JSON for the accepted declaration projection. */
export function canonicalBeingDeclarationJson(value: unknown): string {
  const canonical = canonicalJson(value, 0, {
    ancestors: new Set<object>(),
    valuesVisited: 0,
  });
  const utf8Bytes = Buffer.byteLength(canonical, "utf8");
  if (utf8Bytes > MAX_UTF8_BYTES) {
    fail(
      `Declaration canonical form is ${utf8Bytes} UTF-8 bytes; maximum is ${MAX_UTF8_BYTES}.`,
    );
  }
  return canonical;
}

export function beingDeclarationContentHash(value: unknown): string {
  const canonical = canonicalBeingDeclarationJson(value);
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}
