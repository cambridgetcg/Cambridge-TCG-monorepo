import type { Prisma } from "@prisma/client";

/**
 * A stored JSON column as an object: `{}` when it is null, a primitive or an
 * array. Spreading the result into a new object gives valid Prisma JSON
 * input, so read-modify-write of JSON metadata needs no casts.
 */
export function jsonObject(value: Prisma.JsonValue | undefined): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
