import { randomBytes, randomUUID } from "node:crypto";

const KEY_RE = /^collector-media\/v1\/[0-9a-f]{2}\/[0-9a-f]{64}\.webp$/;

export interface CollectorMediaIdentity {
  id: string;
  objectKey: string;
}

export function createCollectorMediaIdentity(): CollectorMediaIdentity {
  const token = randomBytes(32).toString("hex");
  return {
    id: randomUUID(),
    objectKey: `collector-media/v1/${token.slice(0, 2)}/${token}.webp`,
  };
}

export function isCollectorMediaObjectKey(value: string): boolean {
  return KEY_RE.test(value);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
