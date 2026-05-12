/**
 * SKU builder — structured fields to canonical form.
 *
 * Throws on invalid input. The thrown errors are typed so callers can
 * react to specific failures (unknown game, malformed segment, etc.).
 */

import { isGameCode, type GameCode } from "./games";

export interface SkuInput {
  game: GameCode;
  set: string;
  number: string;
  /** ISO 639-1 (2 letters). */
  lang: string;
  /** Optional variant. May contain hyphens for multi-token variants. */
  variant?: string;
}

export class SkuBuildError extends Error {
  constructor(
    message: string,
    public readonly field: "game" | "set" | "number" | "lang" | "variant",
  ) {
    super(message);
    this.name = "SkuBuildError";
  }
}

const SEGMENT = /^[a-z0-9]+$/;
const LANG = /^[a-z]{2}$/;
const VARIANT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Build a canonical SKU from structured fields. Input is normalized
 * to lowercase. Throws `SkuBuildError` if any field is invalid.
 *
 * @example
 *   buildSku({ game: "op", set: "OP01", number: "001", lang: "JA" })
 *   //=> "op-op01-001-ja"
 *
 *   buildSku({ game: "pkm", set: "svobf", number: "006", lang: "en", variant: "rev" })
 *   //=> "pkm-svobf-006-en-rev"
 */
export function buildSku(input: SkuInput): string {
  if (!isGameCode(input.game)) {
    throw new SkuBuildError(`Unknown game code: ${input.game}`, "game");
  }

  const set = input.set.toLowerCase();
  if (!SEGMENT.test(set)) {
    throw new SkuBuildError(`Set segment must match [a-z0-9]+: ${input.set}`, "set");
  }

  const number = input.number.toLowerCase();
  if (!SEGMENT.test(number)) {
    throw new SkuBuildError(`Number segment must match [a-z0-9]+: ${input.number}`, "number");
  }

  const lang = input.lang.toLowerCase();
  if (!LANG.test(lang)) {
    throw new SkuBuildError(`Lang must be ISO 639-1 (2 lowercase letters): ${input.lang}`, "lang");
  }

  let canonical = `${input.game}-${set}-${number}-${lang}`;

  if (input.variant !== undefined) {
    const variant = input.variant.toLowerCase();
    if (!VARIANT.test(variant)) {
      throw new SkuBuildError(
        `Variant must be hyphen-joined [a-z0-9]+ tokens: ${input.variant}`,
        "variant",
      );
    }
    canonical += `-${variant}`;
  }

  return canonical;
}
