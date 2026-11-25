import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import GuidesPage from "@/app/agents/guides/page";
import GuidePage from "@/app/agents/guides/[slug]/page";
import { GET as notFound } from "@/app/api/v1/[...not_found]/route";
import { GET as adopters } from "@/app/api/v1/adopters/route";
import { GET as budget } from "@/app/api/v1/budget/route";
import { GET as diagnostic } from "@/app/api/v1/diagnostic/route";
import { GET as guide } from "@/app/api/v1/guides/[slug]/route";
import { GET as rateLimits } from "@/app/api/v1/rate-limits/route";
import { GET as index } from "@/app/api/v1/route";
import { GET as cookbook } from "@/app/api/v1/the-tea-room/cookbook/route";
import { GET as welcome } from "@/app/api/v1/welcome/route";
import AuthErrorPage from "@/app/login/error/page";
import ScrapersPage from "@/app/scrapers/page";
import { EXAMPLES } from "@/lib/examples";
import { FAKE_DESTRUCTIVE_REGISTRY } from "@/lib/fake-destructive";
import { GUIDES } from "@/lib/guides";
import { PLATFORM_SELF } from "@/lib/identify";
import { FEEDBACK_KINDS, validateFeedback } from "./door";
import { FEEDBACK_ANSWER_PLACE, FEEDBACK_OPEN_CHECK, FEEDBACK_READ_AIM } from "./promise";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

// The documents that send people and programs to the feedback door show what
// to send. A body the door would refuse is a signpost that does not work.

const source = (file: string) => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8").replaceAll('\\"', '"');
const data = async (response: Response | Promise<Response>) => (await (await response).json()).data;
const words = (markup: string) => markup.replace(/<[^>]+>/g, "").replaceAll("&quot;", '"').replaceAll("&#x27;", "'");

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

  it("name a kind the door takes in /api/v1/diagnostic and at the foot of /agents/guides", async () => {
    const named = [/POST a `([a-z-]+)` kind/.exec(JSON.stringify(await data(diagnostic())))?.[1], /with kind: ([a-z-]+)/.exec(words(renderToStaticMarkup(await GuidesPage())))?.[1]];
    for (const kind of named) expect(FEEDBACK_KINDS).toContain(kind);
  });

  it("give a template in each guide whose fields the door keeps, with the address or without it", async () => {
    for (const { slug } of GUIDES) {
      const { body_template: template, endpoint } = (await data(guide(new Request(`https://cambridgetcg.example/api/v1/guides/${slug}`), { params: Promise.resolve({ slug }) }))).feedback;
      expect(endpoint).toBe("/api/v1/feedback");
      expect(template.reporter_contact).toBe("<optional: an address a person may write to>");
      // The reader fills in what stands between angle brackets.
      const { reporter_contact: address, ...filled } = { ...template, step_number: 2, observation: "step 2 answers 404", expected: "200", reporter_contact: "ada@example.com" };
      for (const body of [filled, { ...filled, reporter_contact: address }]) expect(validateFeedback(body), slug).toMatchObject({ ok: true });
    }
  });

  it("show at the foot of each guide's page a body the door keeps as it stands", async () => {
    for (const { slug } of GUIDES) {
      const shown = /\/api\/v1\/feedback with \{([^}]*)\}/.exec(words(renderToStaticMarkup(await GuidePage({ params: Promise.resolve({ slug }) }))))?.[1];
      expect(validateFeedback(shorthand(shown!)), shown).toMatchObject({ ok: true, value: { kind: "guide-feedback", details: { guide_slug: slug } } });
    }
  });

  it("send no one to a /feedback page, which is not there", () => {
    expect(source("src/app/api/v1/horoscope/[kind]/route.ts")).toContain("tell us at /api/v1/feedback");
    expect(source("src/app/api/v1/horoscope/[kind]/route.ts")).not.toMatch(/(?<!\/api\/v1)\/feedback/);
  });
});

describe("what those documents promise", () => {
  // One aim, to read what the door is sent; no answer, no time for one and no email. And the
  // door can be closed, so they say how to see whether it is.
  const OLDER = /48h response|response window 48h|response_window_hours|respond within 48|within a week|commit SHA|reply with|we(?:'|&#x27;)ll (?:reply|add you|sort it out|resolve)|will read it|smoke-test|accepts reports|keep the key in the reply|nothing is emailed|the answer is shown|our answer/i;
  const steps = (slug: string) => GUIDES.find((entry) => entry.slug === slug)!.steps.map((step) => `${step.instruction} ${step.what_to_do_with_it ?? ""}`).join(" ");
  const texts: Record<string, () => Promise<string>> = {
    "/api/v1/welcome": async () => JSON.stringify(await data(welcome())),
    "/api/v1/budget": async () => JSON.stringify(await data(budget())),
    "/api/v1/diagnostic": async () => JSON.stringify(await data(diagnostic())),
    "/api/v1/adopters": async () => JSON.stringify(await data(adopters())),
    "the respect-our-limits guide": async () => steps("respect-our-limits"),
    "the federate-bilateral guide": async () => steps("federate-bilateral"),
    "/api/v1/delete-everything": async () => FAKE_DESTRUCTIVE_REGISTRY["delete-everything"]!.did_you_mean.note,
    "/scrapers": async () => words(renderToStaticMarkup(await ScrapersPage())),
  };

  it.each(Object.keys(texts))("%s says the one aim and how to see whether the door is open, and none of the older, larger promises", async (name) => {
    const text = await texts[name]!();
    expect(text).toContain(FEEDBACK_READ_AIM);
    expect(text).toContain(FEEDBACK_OPEN_CHECK);
    expect(text).not.toMatch(OLDER);
  });

  it("gives the address and no more where only the mailbox is offered", async () => {
    const offered = await data(index()), limits = await data(rateLimits()), said = await data(welcome());
    expect([offered.where_to_look_when_something_is_off.contact_human, said.where_to_look_when_something_is_off.contact_human, limits.contact_on_block]).toEqual(Array(3).fill("contact@cambridgetcg.com"));
    expect(limits.appeal_process).toBe("If you've been firewalled, email contact@cambridgetcg.com with your bot's name + contact email + intended use.");
    const missing = await notFound(new Request("https://cambridgetcg.example/api/v1/nowhere") as never, { params: Promise.resolve({ not_found: ["nowhere"] }) });
    expect((await missing.json()).error.message).toMatch(/If you believe this path should exist, write to contact@cambridgetcg\.com\.$/);
    const signIn = words(renderToStaticMarkup(await AuthErrorPage({ searchParams: Promise.resolve({}) })));
    expect(signIn).toMatch(/Still stuck\? Contact us\.$/);
    for (const text of [JSON.stringify(offered), JSON.stringify(limits), signIn]) {
      expect(text).not.toContain("48 hours");
      expect(text).not.toMatch(OLDER);
    }
  });

  it("says the aim, and how to see whether the door is open, in each of welcome's places for the door", async () => {
    const said = await data(welcome());
    expect(said.after_step_7.report_a_bug).toBe(`POST /api/v1/feedback. ${FEEDBACK_OPEN_CHECK} ${FEEDBACK_READ_AIM}`);
    expect(said.feedback).toEqual({ endpoint: "/api/v1/feedback", kinds: [...FEEDBACK_KINDS], contact_email: "contact@cambridgetcg.com", taking_messages: FEEDBACK_OPEN_CHECK, response_aim: FEEDBACK_READ_AIM });
    expect(said.welcome.to_federation_partners).toContain(FEEDBACK_OPEN_CHECK);
  });

  it("says in the help recipe how to see whether the door is open, and that a request id alone finds nothing", async () => {
    const text = JSON.stringify(await data(cookbook(new Request("https://cambridgetcg.example/api/v1/the-tea-room/cookbook?dish=ask-for-help") as never)));
    expect(text).toContain(`${FEEDBACK_OPEN_CHECK} While it is not, it keeps nothing you send.`);
    expect(text).toContain("a request_id alone cannot be looked up");
    expect(text).not.toMatch(/operator can find it/);
  });

  it("says in both guides and the example where an answer is, and in both guides that a key comes only if the message is taken", () => {
    for (const text of [steps("respect-our-limits"), steps("federate-bilateral"), EXAMPLES.find((example) => example.endpoint_id === "feedback")!.gotchas.join(" ")]) {
      expect(text).toContain(FEEDBACK_ANSWER_PLACE);
      expect(text).not.toMatch(/reply by email/);
    }
    for (const slug of ["respect-our-limits", "federate-bilateral"]) expect(steps(slug)).toContain(`${FEEDBACK_OPEN_CHECK} If yours is taken, the reply holds a key: keep it. ${FEEDBACK_READ_AIM} ${FEEDBACK_ANSWER_PLACE}`);
  });

  it("says in the adopters registry and its guide that a person adds platforms by hand, and what a listing shows", async () => {
    for (const text of [await texts["/api/v1/adopters"]!(), steps("federate-bilateral")]) expect(text).toMatch(/A person adds platforms to (?:this|the adopters) list(?: \(\/api\/v1\/adopters\))? by hand; nothing you send is called or added automatically\./);
    expect((await data(adopters())).how_to_become_an_adopter.step_2).toContain("A listing shows your platform's name, URL, kind, standards and federation endpoint, the date you declared it and any note; it has no field for your reporter_contact.");
    // Each field a listing can carry, and no other.
    expect([.../interface Adopter \{([\s\S]*?)\n\}/.exec(source("src/app/api/v1/adopters/route.ts"))![1]!.matchAll(/^ {2}([a-z_]+)\??:/gm)].map((match) => match[1])).toEqual(["name", "url", "kind", "standards", "declared_at", "note", "federation_endpoint", "rights"]);
  });

  it("does not say that Cambridge TCG calls a partner's endpoint, which no code does", async () => {
    const { subtitle, intro, steps: [first] } = GUIDES.find((entry) => entry.slug === "federate-bilateral")!;
    expect(intro).not.toContain("interop with us");
    expect(subtitle).toBe("Implement /federation/identify on your side. Cambridge TCG does not call it today.");
    expect(first!.instruction).not.toContain("Cambridge TCG");
    expect((await data(welcome())).welcome.to_federation_partners).toMatch(/Cambridge TCG does not call your endpoint today\.$/);
    for (const route of ["identify/[hash]", "at/[date]/[hash]"]) expect(source(`src/app/api/v1/federation/${route}/route.ts`)).not.toMatch(/\bfetch\(/);
  });

  it("gives no response time of Cambridge's own in /api/v1/identify", () => {
    expect(PLATFORM_SELF).not.toHaveProperty("response_window_hours");
  });

  it("names only kinds the door takes at /api/v1/budget, with the aim", async () => {
    const { kinds_relevant_here: relevant, response_aim: aim, taking_messages: check } = (await data(budget())).feedback;
    for (const kind of relevant) expect(FEEDBACK_KINDS).toContain(kind);
    expect([aim, check]).toEqual([FEEDBACK_READ_AIM, FEEDBACK_OPEN_CHECK]);
  });
});
