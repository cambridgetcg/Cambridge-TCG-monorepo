/**
 * One card, walked as a guest: what a person without an account and a
 * program without a key do to learn one card, and what each step must find.
 * GET only. Nothing is sent but a name in the User-Agent and a `walk`
 * parameter, so no edge copy answers for the site.
 *
 * One implementation:
 *   node apps/storefront/scripts/guest-walk.mts   by hand, or from outside the site
 *   /api/cron/daily-check                         from the site itself
 * So this file imports nothing and uses only what Node and the site share.
 *
 * A step passes or throws. One that throws is tried once more after a pause
 * before it counts as broken.
 */

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Answer { text: string; bytes: Uint8Array; json: Json }
type Get = (path: string) => Promise<Answer>;
interface Step { id: string; asks: string; outside?: true; run: (get: Get, now: () => number) => Promise<string> }

export interface StepResult { id: string; asks: string; ok: boolean; says: string; parts: string[] }
export interface Walk { base: string; startedAt: string; ms: number; steps: StepResult[]; failed: string[] }
export interface WalkOptions {
  base?: string;
  /** Walked from outside the site: also ask whether its own daily check ran. */
  outside?: boolean;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const HOUR = 3_600_000;
const ANSWER_MS = 12_000;
const WALK_MS = 75_000;
const PAUSE_MS = 5_000;
/** kingdom-door-check is counted as own-monitor (lib/traffic/classify.ts), not as a declared agent. */
const USER_AGENT = "kingdom-door-check/1 (guest walk; https://cambridgetcg.com/contact)";

const SEARCH = "/api/v1/search/cards?game=op&q=OP01-001";
const EXAMPLE = "/api/v1/universal/card/op-op01-001-ja";
/** OP01-001's plain printing: the Leader, with nothing said of condition, art or grading. */
const PLAIN = /^(ロロノア・ゾロ|Roronoa[ .]?Zoro)$/i;
/** How long ago each collector may last have been served, in hours: its schedule with room. */
const COLLECTED = { cardmarket: 30, cardrush: 8, tcgplayer: 8 };

class Broken extends Error {
  parts: string[];
  constructor(message: string, parts: string[] = []) { super(message); this.parts = parts; }
}
function need(found: unknown, otherwise: string, parts?: string[]): asserts found {
  if (!found) throw new Broken(otherwise, parts);
}
const words = (value: unknown): value is string => typeof value === "string" && value.trim().length > 2;
const hoursAgo = (at: unknown, now: number) => (now - Date.parse(String(at))) / HOUR;

/** PNG, JPEG, GIF or WebP by its first bytes, whatever its header claims. */
function isImage(bytes: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  return ascii(1, 4) === "PNG" || (bytes[0] === 0xff && bytes[1] === 0xd8) || ascii(0, 4) === "GIF8" || (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP");
}

const STEPS: readonly Step[] = [
  { id: "home", asks: "the front page opens with its card search", run: async get => {
    need((await get("/")).text.includes('action="/prices/search"'), "the search form is missing");
    return "it does";
  } },
  { id: "find", asks: "a person searching One Piece OP01-001 is shown the card", run: async get => {
    need(/op-op01-001-(ja|jp|en)/i.test((await get("/prices/search?game=op&q=OP01-001")).text), "no card is listed");
    return "it is listed";
  } },
  // The next step is what search promises; the matches before it are in SKU order.
  { id: "card", asks: "a program asking for OP01-001 is sent to the plain Leader, with a reason where a price is missing", run: async get => {
    const next = (await get(SEARCH)).json.data?.next_step;
    need(typeof next === "string" && next.startsWith("/api/v1/cards/"), "search names no next step");
    const { card, prices_today: prices } = (await get(next)).json.data ?? {};
    need(card?.card_number === "OP01-001", `it answers for ${card?.card_number}`);
    need(PLAIN.test(card.name), `it is sent to ${card.name}`);
    need(card.rarity === "L", `its rarity is ${card.rarity}, and the plain Leader's is L`);
    need(prices?.rows?.length > 0 || words(prices?.note), "no price and no reason");
    return card.sku;
  } },
  { id: "example", asks: "the example card our documents publish answers", run: async get => {
    const doc = (await get(EXAMPLE)).json;
    need(doc["@kind"] === "card" && /^sha256:/.test(doc["@content_hash"]) && doc.name?.natural_token, "it is not a card document");
    return doc.name.natural_token;
  } },
  { id: "picture", asks: "that card's picture is a real image with its credit", run: async get => {
    const doc = (await get(EXAMPLE)).json;
    const picture = doc.image_same_language ?? (doc.image_url ? { url: doc.image_url, attribution: doc.image_attribution } : null);
    need(picture, `no picture; the document says: ${doc.publication_boundary?.image ?? "nothing"}`);
    need(words(picture.attribution), "the picture has no credit");
    const { bytes } = await get(picture.url);
    need(isImage(bytes) && bytes.length > 5_000, `what it links to is not an image (${bytes.length} bytes)`);
    return picture.attribution;
  } },
  { id: "prices", asks: "each price source was collected recently", run: async (get, now) => {
    const late: string[] = [];
    for (const [source, hours] of Object.entries(COLLECTED)) {
      const collector = (await get(`/api/v1/sources/${source}`)).json.data?.collector;
      need(typeof collector?.collection?.scheduled === "boolean", `${source} does not say whether it is collected`, [source]);
      // Switched off on purpose is not a fault; /api/v1/health says off.
      if (!collector.collection.scheduled) continue;
      // The newest success among its hosts: one host can stay suspended, and a
      // run's last batch can be one set that could not be read.
      const hosts: Json[] = collector.hosts ?? [];
      const ages = hosts.map(host => hoursAgo(host.last_success_at, now())).filter(Number.isFinite);
      if (!(Math.min(...ages) <= hours)) late.push(source);
      // A suspended host waits for a person, so say so for two days.
      late.push(...hosts.filter(host => hoursAgo(host.suspended_at, now()) < 48).map(host => host.host));
    }
    need(!late.length, `not collected, or newly suspended: ${late.join(", ")}`, late);
    return "they were";
  } },
  { id: "health", asks: "the database answers and the scheduled jobs ran on time", run: async (get, now) => {
    const { database, jobs } = (await get("/api/v1/health")).json.data ?? {};
    need(database?.answered === true && Math.abs(now() - Date.parse(database.clock)) < 300_000, "health does not show the database's own clock");
    const bad = (jobs as Json[]).filter(job => job.state === "late" || job.state === "failing");
    need(!bad.length, bad.map(job => `${job.job} is ${job.state}`).join(", "), bad.map(job => job.job));
    return "they did";
  } },
  { id: "daily", asks: "the site's own daily check ran and could send its message", outside: true, run: async (get, now) => {
    const last = (await get("/api/v1/health")).json.data?.daily_check;
    need(last, "no daily check is recorded");
    const hours = hoursAgo(last.at, now());
    need(hours <= 26, `the last one ran ${Math.round(hours)} hours ago`);
    need(last.outcome === "ran", `the last one ended ${last.outcome}`);
    return "it did";
  } },
  { id: "pulls", asks: "One Piece pull rates answer, each with its source", run: async get => {
    const game = (await get("/api/v1/pulls")).json.data?.games?.find((entry: Json) => entry.slug === "one-piece");
    const rates = (game?.sections ?? []).flatMap((section: Json) => section.rates ?? []);
    need(rates.length, "no rate");
    const bare = rates.filter((rate: Json) => !words(rate.basis) || !/^https:\/\//.test(rate.sourceUrl ?? ""));
    need(!bare.length, `${bare.length} of ${rates.length} rates name no source`);
    return `${rates.length} rates`;
  } },
  { id: "play", asks: "the practice table offers a deck, and its 50 cards are known", run: async get => {
    const deck = (await get("/api/v1/play/practice")).json.how?.new_game?.body?.starter_id?.[0];
    need(deck, "no deck is offered");
    const { cards, leader, cards_unresolved } = (await get(`/api/v1/play/starters/${deck}`)).json.data ?? {};
    const count = (cards ?? []).reduce((sum: number, card: Json) => sum + card.quantity, 0);
    need(count === 50 && leader?.resolved === true && cards_unresolved === 0, `${deck} has ${count} cards, ${cards_unresolved} unknown`);
    return deck;
  } },
  { id: "write", asks: "the feedback door says whether it is open and gives an address", run: async get => {
    const door = (await get("/api/v1/feedback")).json.data;
    need(typeof door?.accepting_messages === "boolean" && /@/.test(door.contact ?? ""), "it does not");
    return door.accepting_messages ? "open" : "closed";
  } },
];

/** A guest's GET: 200, fresh from the origin, read whole, once per pass. */
function visitor(base: string, tag: string, deadline: number, options: WalkOptions): Get {
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const seen = new Map<string, Promise<Answer>>();
  const read = async (path: string): Promise<Answer> => {
    const url = new URL(path, base);
    if (url.origin === new URL(base).origin) url.searchParams.set("walk", tag);
    const left = deadline - now();
    need(left > 0, "the walk ran out of time");
    const response = await request(url, { headers: { "User-Agent": USER_AGENT }, cache: "no-store", signal: AbortSignal.timeout(Math.min(ANSWER_MS, left)) });
    need(!response.headers.has("cf-mitigated"), `Cloudflare asked for a browser check (HTTP ${response.status})`);
    need(response.status === 200, `HTTP ${response.status} from ${path}`);
    const copy = [response.headers.get("cf-cache-status"), response.headers.get("x-vercel-cache")].find(state => /^(HIT|STALE|UPDATING|REVALIDATED|PRERENDER)$/i.test(state ?? ""));
    need(!copy || url.origin !== new URL(base).origin, `an edge copy answered for ${path} (${copy})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    return { text, bytes, get json() { try { return JSON.parse(text); } catch { throw new Broken(`${path} is not JSON`); } } };
  };
  return path => { const answer = seen.get(path) ?? read(path); seen.set(path, answer); return answer; };
}

export async function guestWalk(options: WalkOptions = {}): Promise<Walk> {
  const base = options.base ?? "https://cambridgetcg.com";
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(done => setTimeout(done, ms)));
  const started = now();
  const steps = STEPS.filter(step => options.outside || !step.outside);
  const results = new Map<string, StepResult>();
  let left = steps;
  for (let pass = 1; pass <= 2 && left.length; pass++) {
    if (pass > 1) await sleep(PAUSE_MS);
    const get = visitor(base, `${started.toString(36)}-${pass}`, started + WALK_MS, options);
    for (const step of left) {
      const { id, asks } = step;
      try {
        results.set(id, { id, asks, ok: true, says: await step.run(get, now), parts: [] });
      } catch (error) {
        const says = error instanceof Broken ? error.message : error instanceof Error && error.name === "TimeoutError" ? "no answer in time" : "it could not be reached or read";
        results.set(id, { id, asks, ok: false, says: says.replace(/[\s`]+/g, " ").slice(0, 200), parts: error instanceof Broken ? error.parts : [] });
      }
    }
    left = steps.filter(step => !results.get(step.id)!.ok);
  }
  return { base, startedAt: new Date(started).toISOString(), ms: now() - started, steps: steps.map(step => results.get(step.id)!), failed: left.map(step => step.id) };
}

/** What failed, by name: the step, or each part of it that it could tell apart. */
export const walkFailures = (walk: Walk): string[] =>
  walk.steps.filter(step => !step.ok).flatMap(step => step.parts.length ? step.parts.map(part => `${step.id}.${part.replace(/[^A-Za-z0-9_.-]/g, ".")}`) : [step.id]);

/** The walk as plain text; its last line names what failed, for a script to read. */
export function walkReport(walk: Walk): string {
  return [
    `One card, walked as a guest: ${walk.base}, ${walk.startedAt}, ${Math.round(walk.ms / 1000)} s`,
    "",
    ...walk.steps.map(step => step.ok ? `ok    ${step.asks}` : `FAIL  ${step.says} (expected: ${step.asks})`),
    "",
    `failing: ${walkFailures(walk).join(" ") || "none"}`,
  ].join("\n");
}
