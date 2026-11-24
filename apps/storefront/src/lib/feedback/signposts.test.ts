import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GET as adopters } from "@/app/api/v1/adopters/route";
import { GET as budget } from "@/app/api/v1/budget/route";
import { GET as diagnostic } from "@/app/api/v1/diagnostic/route";
import { GET as guide } from "@/app/api/v1/guides/[slug]/route";
import { GET as rateLimits } from "@/app/api/v1/rate-limits/route";
import { GET as index } from "@/app/api/v1/route";
import { GET as welcome } from "@/app/api/v1/welcome/route";
import AuthErrorPage from "@/app/login/error/page";
import ScrapersPage from "@/app/scrapers/page";
import { EXAMPLES } from "@/lib/examples";
import { FAKE_DESTRUCTIVE_REGISTRY } from "@/lib/fake-destructive";
import { GUIDES } from "@/lib/guides";
import { FEEDBACK_KINDS, validateFeedback } from "./door";
import { FEEDBACK_ANSWER_PLACE, FEEDBACK_READ_AIM } from "./promise";

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

describe("what those documents promise", () => {
  // One aim, to read, in the same words everywhere; no answer, no time for one and no email.
  const steps = (slug: string) => GUIDES.find((entry) => entry.slug === slug)!.steps.map((step) => `${step.instruction} ${step.what_to_do_with_it ?? ""}`).join(" ");
  const texts: Record<string, () => Promise<string>> = {
    "/api/v1": async () => JSON.stringify(await data(index())),
    "/api/v1/welcome": async () => JSON.stringify(await data(welcome())),
    "/api/v1/budget": async () => JSON.stringify(await data(budget())),
    "/api/v1/diagnostic": async () => JSON.stringify(await data(diagnostic())),
    "/api/v1/rate-limits": async () => JSON.stringify(await data(rateLimits())),
    "/api/v1/adopters": async () => JSON.stringify(await data(adopters())),
    "the respect-our-limits guide": async () => steps("respect-our-limits"),
    "the federate-bilateral guide": async () => steps("federate-bilateral"),
    "/api/v1/delete-everything": async () => FAKE_DESTRUCTIVE_REGISTRY["delete-everything"]!.did_you_mean.note,
    "/scrapers": async () => renderToStaticMarkup(await ScrapersPage()).replace(/<[^>]+>/g, ""),
    "/login/error": async () => renderToStaticMarkup(await AuthErrorPage({ searchParams: Promise.resolve({}) })).replace(/<[^>]+>/g, ""),
  };

  it.each(Object.keys(texts))("%s says the one aim and none of the older, larger ones", async (name) => {
    const text = await texts[name]!();
    expect(text).toContain(FEEDBACK_READ_AIM);
    expect(text).not.toMatch(/48h response|response window 48h|response_window_hours|respond within 48|within a week|commit SHA|reply with|we(?:'|&#x27;)ll (?:reply|add you|sort it out)|will read it|smoke-test/i);
  });

  it("says in both guides and the example where the answer is", () => {
    for (const text of [steps("respect-our-limits"), steps("federate-bilateral"), EXAMPLES.find((example) => example.endpoint_id === "feedback")!.gotchas.join(" ")]) {
      expect(text).toContain(FEEDBACK_ANSWER_PLACE);
      expect(text).not.toMatch(/reply by email/);
    }
  });

  it("lists every kind the door takes at /api/v1/welcome, and only those at /api/v1/budget", async () => {
    expect((await data(welcome())).feedback).toEqual({ endpoint: "/api/v1/feedback", kinds: [...FEEDBACK_KINDS], contact_email: "contact@cambridgetcg.com", response_aim: FEEDBACK_READ_AIM });
    const { kinds_relevant_here: relevant, response_aim: aim } = (await data(budget())).feedback;
    for (const kind of relevant) expect(FEEDBACK_KINDS).toContain(kind);
    expect(aim).toBe(FEEDBACK_READ_AIM);
  });
});
