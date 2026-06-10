/**
 * Typed shape of `rp-shared.css`.
 *
 * The CSS is the canonical source. The registry is the typed
 * derivative — every consumer above the foundation layer (handoff
 * validator, scorer, bridge) imports the registry instead of
 * re-parsing the CSS itself.
 */
export type TokenCategory =
  | "spacing"
  | "font"
  | "radius"
  | "shadow"
  | "duration"
  | "easing"
  | "color-semantic"
  | "color-state"
  | "color-rarity"
  | "viewport";

export interface Token {
  /** Full custom-property name including the leading `--`. */
  name: string;
  /** Light-mode value (the value from the base `:root` block). */
  value: string;
  /** Dark-mode override, if the token is overridden under `prefers-color-scheme: dark`. */
  darkValue?: string;
  /** Bucket derived from the name prefix. */
  category: TokenCategory;
}

export interface Primitive {
  /** Class name without the leading dot (e.g. `"rp-btn"`, `"rp-btn--primary"`). */
  name: string;
  /** 1-indexed line number in the source CSS where this primitive's first rule starts. */
  line: number;
}

export interface Registry {
  tokens: Token[];
  primitives: Primitive[];
  /** Tokens bucketed by category for ergonomic iteration. */
  byCategory: Record<TokenCategory, Token[]>;
  /** O(1) membership check for token names (`"--rp-space-md"` → bool). */
  tokenNames: Set<string>;
  /** O(1) membership check for primitive class names (`"rp-btn"` → bool). */
  primitiveNames: Set<string>;
}
