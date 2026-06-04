/**
 * Top-level: read `rp-shared.css` once, parse, expose as a typed registry.
 *
 * Consumers import `registry` directly; the file read happens at module
 * load. For tests / synthetic CSS, import `parse()` from `./parser` and
 * pass your own input.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "./parser";
import type { Registry, Token } from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const RP_SHARED_CSS_PATH = path.resolve(
  __dirname,
  "../../extensions/theme-app-extension-rewardspro/assets/rp-shared.css"
);

const cssText = fs.readFileSync(RP_SHARED_CSS_PATH, "utf-8");

/** The registry parsed from the canonical `rp-shared.css`. */
export const registry: Registry = parse(cssText);

/** Look up a token's value in light or dark mode. */
export function tokenValue(name: string, mode: "light" | "dark" = "light"): string | undefined {
  const t = registry.tokens.find((t) => t.name === name);
  if (!t) return undefined;
  return mode === "dark" ? (t.darkValue ?? t.value) : t.value;
}

/** Is this name a known token in the registry? */
export function isKnownToken(name: string): boolean {
  return registry.tokenNames.has(name);
}

/** Is this class name a known primitive? */
export function isKnownPrimitive(name: string): boolean {
  return registry.primitiveNames.has(name);
}

export { parse } from "./parser";
export type { Registry, Token, Primitive, TokenCategory } from "./types";
export type { Token as RegistryToken };
