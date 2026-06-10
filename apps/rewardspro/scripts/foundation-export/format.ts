/**
 * Pure formatters — turn a `Registry` into JSON / TypeScript artifacts
 * that downstream consumers (Next.js admin, JSON pipelines, design-tool
 * imports) can use without re-parsing the CSS.
 *
 * Both artifacts include a header that names the canonical source file
 * and the exact regeneration command, so a consumer reading the output
 * always knows where it came from and how to refresh it.
 */
import type { Registry } from "../rp-registry/types";
import type { Artifact } from "./types";

const REGEN_HINT = "Run `npm run foundation:export` to regenerate.";
const SOURCE = "extensions/theme-app-extension-rewardspro/assets/rp-shared.css";

export function formatJson(registry: Registry, now?: string): Artifact {
  const data = {
    $schema: "rp-foundation/v1",
    generatedAt: now ?? new Date().toISOString(),
    source: SOURCE,
    tokens: Object.fromEntries(
      registry.tokens.map((t) => [
        t.name,
        {
          value: t.value,
          ...(t.darkValue !== undefined ? { dark: t.darkValue } : {}),
          category: t.category,
        },
      ])
    ),
    primitives: registry.primitives.map((p) => p.name),
  };
  return {
    format: "json",
    filename: "tokens.json",
    content: JSON.stringify(data, null, 2) + "\n",
  };
}

export function formatTs(registry: Registry, now?: string): Artifact {
  const lines: string[] = [];
  lines.push(`/**`);
  lines.push(` * Auto-generated from \`${SOURCE}\`. Do not edit.`);
  lines.push(` * ${REGEN_HINT}`);
  lines.push(` * Generated: ${now ?? new Date().toISOString()}`);
  lines.push(` */`);
  lines.push(``);
  lines.push(`export const tokens = {`);
  for (const t of registry.tokens) {
    const dark = t.darkValue !== undefined ? `, dark: ${jsString(t.darkValue)}` : "";
    lines.push(
      `  ${jsKey(t.name)}: { value: ${jsString(t.value)}${dark}, category: ${jsString(
        t.category
      )} },`
    );
  }
  lines.push(`} as const;`);
  lines.push(``);
  lines.push(`export type TokenName = keyof typeof tokens;`);
  lines.push(``);
  lines.push(`export const primitives = [`);
  for (const p of registry.primitives) {
    lines.push(`  ${jsString(p.name)},`);
  }
  lines.push(`] as const;`);
  lines.push(``);
  lines.push(`export type PrimitiveName = (typeof primitives)[number];`);
  lines.push(``);
  return {
    format: "ts",
    filename: "tokens.ts",
    content: lines.join("\n"),
  };
}

function jsKey(name: string): string {
  // Token names contain hyphens, so they must be quoted as keys.
  return JSON.stringify(name);
}

function jsString(value: string): string {
  return JSON.stringify(value);
}
