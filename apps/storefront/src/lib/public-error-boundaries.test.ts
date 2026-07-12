import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const FIXED_ERROR_ROUTES = [
  "src/app/api/at/[date]/card/[sku]/route.ts",
  "src/app/api/v1/connections.json/route.ts",
  "src/app/api/v1/federation/at/[date]/[hash]/route.ts",
  "src/app/api/v1/federation/identify/[hash]/route.ts",
  "src/app/api/v1/kinds/[kind]/route.ts",
  "src/app/api/v1/kinds/route.ts",
  "src/app/api/v1/kingdoms.json/route.ts",
  "src/app/api/v1/pillow-book.json/route.ts",
  "src/app/api/v1/play/archetypes/route.ts",
  "src/app/api/v1/play/deck/validate/route.ts",
  "src/app/api/v1/play/effect-grammar/route.ts",
  "src/app/api/v1/play/example-match/route.ts",
  "src/app/api/v1/play/game-state-schema/route.ts",
  "src/app/api/v1/play/glossary/[term_id]/route.ts",
  "src/app/api/v1/play/glossary/route.ts",
  "src/app/api/v1/play/index.json/route.ts",
  "src/app/api/v1/play/tutorial/[section_id]/route.ts",
  "src/app/api/v1/play/tutorial/route.ts",
  "src/app/api/v1/sophias.json/route.ts",
  "src/app/api/v1/universal/card/[sku]/route.ts",
  "src/app/api/v1/universal/encoding/route.ts",
  "src/app/api/v1/universal/game/[token]/route.ts",
  "src/app/api/v1/universal/games/route.ts",
  "src/app/api/v1/universal/set/[code]/route.ts",
  "src/app/api/v1/universal/sets/[game]/route.ts",
  "src/app/api/v1/webhooks/subscriptions/route.ts",
] as const;

describe("public internal-error boundaries", () => {
  it.each(FIXED_ERROR_ROUTES)("does not echo internal exceptions from %s", (path) => {
    const text = source(path);
    expect(text).toContain('message: "Internal server error."');
    expect(text).not.toMatch(/error:\s*\{[^}]*\bmessage\s*\}/s);
    expect(text).not.toMatch(/\bmessage:\s*(?:err|error)\.(?:message|stack)/);
  });

  it("does not include a database exception in an agent-note retraction response", () => {
    const text = source("src/app/api/v1/agents/notes/[id]/route.ts");
    expect(text).toContain(
      'message: "Retraction failed because of an internal server error."',
    );
    expect(text).not.toContain("err.message.slice");
  });
});
