import {
  canonicalOpportunitySignalEvidenceBundleBytesV1,
  canonicalOpportunitySignalRequestBytesV1,
} from "./canonical";
import type {
  OpportunitySignalSha256Digest,
  OpportunitySignalSha256DigestProvider,
} from "./types";

export class OpportunitySignalCryptoUnavailableError extends Error {
  readonly name = "OpportunitySignalCryptoUnavailableError";

  constructor() {
    super(
      "A Web Crypto SHA-256 provider is required. Pass one explicitly when globalThis.crypto.subtle is unavailable.",
    );
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class OpportunitySignalInvalidDigestError extends Error {
  readonly name = "OpportunitySignalInvalidDigestError";
  readonly received_bytes: number | null;

  constructor(receivedBytes: number | null) {
    super("The SHA-256 provider must return exactly 32 bytes in an ArrayBuffer.");
    this.received_bytes = receivedBytes;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const ARRAY_BUFFER_BYTE_LENGTH = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)?.get;

function arrayBufferByteLength(value: unknown): number | null {
  if (!ARRAY_BUFFER_BYTE_LENGTH) return null;
  try {
    return ARRAY_BUFFER_BYTE_LENGTH.call(value) as number;
  } catch {
    return null;
  }
}

function availableDigestProvider(
  injected?: OpportunitySignalSha256DigestProvider,
): OpportunitySignalSha256DigestProvider {
  if (injected) return injected;
  const subtle = (
    globalThis as typeof globalThis & {
      crypto?: { subtle?: OpportunitySignalSha256DigestProvider };
    }
  ).crypto?.subtle;
  if (!subtle) throw new OpportunitySignalCryptoUnavailableError();
  return subtle;
}

async function sha256(
  bytes: Uint8Array,
  digestProvider?: OpportunitySignalSha256DigestProvider,
): Promise<OpportunitySignalSha256Digest> {
  const digestInput = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(digestInput).set(bytes);
  const digest = await availableDigestProvider(digestProvider).digest(
    "SHA-256",
    digestInput,
  );
  const byteLength = arrayBufferByteLength(digest);
  if (byteLength !== 32) throw new OpportunitySignalInvalidDigestError(byteLength);
  const hexadecimal = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hexadecimal}`;
}

export function opportunitySignalEvidenceBundleDigestV1(
  rawEvidenceEnvelope: unknown,
  digestProvider?: OpportunitySignalSha256DigestProvider,
): Promise<OpportunitySignalSha256Digest> {
  return sha256(
    canonicalOpportunitySignalEvidenceBundleBytesV1(rawEvidenceEnvelope),
    digestProvider,
  );
}

export function opportunitySignalRequestDigestV1(
  rawInput: unknown,
  digestProvider?: OpportunitySignalSha256DigestProvider,
): Promise<OpportunitySignalSha256Digest> {
  return sha256(canonicalOpportunitySignalRequestBytesV1(rawInput), digestProvider);
}
