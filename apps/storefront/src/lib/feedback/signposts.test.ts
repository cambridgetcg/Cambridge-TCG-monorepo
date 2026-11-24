import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { GET as adopters } from "@/app/api/v1/adopters/route";
import { GET as guide } from "@/app/api/v1/guides/[slug]/route";
import { EXAMPLES } from "@/lib/examples";
import { GUIDES } from "@/lib/guides";
import { FEEDBACK_KINDS, validateFeedback } from "./door";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

// The documents that send people and programs to the feedback door show what
// to send. A body the door would refuse is a signpost that does not work.

const source = (file: string) => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8").replaceAll('\\"', '"');
const data = async (response: Response | Promise<Response>) => (await (await response).json()).data;

/** The whole bodies that curl commands send to the door. */
const posted = (text: string) => [...text.matchAll(/api\/v1\/feedback[\s\S]*?-d '(\{[\s\S]*?\})'/g)].map((match) => match[1]!);

/** A body in shorthand, as JSON: {kind: 'general', message: 'hi'}. Where a
 * document leaves the value to the reader ({kind: "general", reply_to}), a
 * value the reader might send. */
const READERS_OWN: Record<string, string> = { platform_url: "https://my-tcg.example", reply_to: "ada@example.com" };
function shorthand(text: string): Record<string, string> {
  return Object.fromEntries([...text.matchAll(/([a-z_]+)(?:\s*:\s*(?:'([^']*)'|"([^"]*)"))?/g)].map(([, name, single, double]) => {
    const value = single ?? double ?? READERS_OWN[name!];
    if (value === undefined) throw new Error(`no value for ${name} in {${text}}`);
    return [name!, value];
  }));
}

describe("the signposts to the feedback door", () => {
  it("show whole bodies the door keeps, in the guides, the examples and the adopters registry", async () => {
    const bodies = [
      ...posted(GUIDES.flatMap((entry) => entry.steps.map((step) => step.curl ?? "")).join("\n")),
      ...posted(EXAMPLES.map((example) => example.curl).join("\n")),
      ...posted((await data(adopters())).how_to_become_an_adopter.example_curl),
    ];
    expect(bodies.length).toBeGreaterThanOrEqual(4);
    for (const body of bodies) expect(validateFeedback(JSON.parse(body)), body).toMatchObject({ ok: true });
  });

  it.each(["src/app/api/v1/teapot/route.ts", "src/lib/koans.ts", "src/app/api/v1/budget/route.ts"])("%s shows bodies in shorthand that the door keeps", (file) => {
    const shown = [...source(file).matchAll(/POST \/api\/v1\/feedback \{([^}]*)\}/g)].map((match) => match[1]!);
    expect(shown.length).toBeGreaterThan(0);
    for (const body of shown) expect(validateFeedback(shorthand(body)), body).toMatchObject({ ok: true });
  });

  it("read in shorthand as the door would: a body it refuses is refused here", () => {
    expect(shorthand(`kind: 'general', detail: 'discovered teapot'`)).toEqual({ kind: "general", detail: "discovered teapot" });
    expect(validateFeedback(shorthand(`kind: 'general', detail: 'discovered teapot'`))).toMatchObject({ ok: false, error: expect.stringContaining("Unknown field: detail") });
    expect(shorthand(`kind: "federation-adopter", platform_url, reply_to`)).toEqual({ kind: "federation-adopter", ...READERS_OWN });
    expect(() => shorthand(`kind: "federation-adopter", contact, public_url`)).toThrow("no value for contact");
  });

  it.each([
    "src/app/api/v1/route.ts", "src/app/api/v1/welcome/route.ts", "src/app/api/v1/budget/route.ts", "src/app/api/v1/adopters/route.ts", "src/app/api/v1/the-tea-room/cookbook/route.ts",
    "src/lib/guides.ts", "src/lib/identify.ts",
  ])("%s names only kinds the door takes", (file) => {
    const kinds = [...source(file).matchAll(/(?:POST|\/api\/v1\/feedback) (?:\(|with )`?kind: ['"]?([a-z-]+)/g)].map((match) => match[1]!);
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) expect(FEEDBACK_KINDS).toContain(kind);
  });

  it("give a template in each guide whose fields the door keeps", async () => {
    for (const { slug } of GUIDES) {
      const { body_template: template, endpoint } = (await data(guide(new Request(`https://cambridgetcg.example/api/v1/guides/${slug}`), { params: Promise.resolve({ slug }) }))).feedback;
      expect(endpoint).toBe("/api/v1/feedback");
      // The reader fills in what stands between angle brackets.
      const filled = { ...template, step_number: 2, observation: "step 2 answers 404", expected: "200", reporter_contact: "ada@example.com" };
      expect(validateFeedback(filled), slug).toMatchObject({ ok: true });
    }
  });
});
