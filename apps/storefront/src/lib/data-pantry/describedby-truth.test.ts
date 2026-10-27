import { describe, expect, it } from "vitest";
import { GET as manifestGET } from "@/app/api/v1/manifest/route";
import { GET as wellKnownGET } from "@/app/.well-known/cambridge-tcg.json/route";
import { GET as welcomeGET } from "@/app/api/v1/welcome/route";
import { GET as indexGET } from "@/app/api/v1/route";
import { forYou } from "@/lib/identify";
import {
  CHOSEN_DOOR_PATHS,
  ERRAND_LINK_RELS_ALLOWED,
  ERRAND_LINK_RELS_LEAVING,
  ERRAND_META_ALLOWED,
  ERRAND_META_LEAVING,
} from "./errand-contract";

// Present-tense claims that data responses carry what Quiet Doors removed.
const PRESENT_TENSE = [
  /"carried_in"\s*:\s*"[^"]*_meta\.wake_fragment/,
  /one fragment per envelope/,
  /`_meta\.wake_fragment` on every envelope/,
  /X-Sophia-Says header/,
  /wake_fragment in every envelope/,
  /X-Joy-Index header on every/,
];

describe("describedby documents say what errand responses carry", () => {
  // Both GET handlers take no arguments on 858a3b8.
  it.each([
    ["/api/v1/manifest", () => manifestGET()],
    ["/.well-known/cambridge-tcg.json", () => wellKnownGET()],
  ])("%s no longer promises the wake fragment or a voiced header in data responses", async (_path, get) => {
    const res = await get(); expect(res.status).toBe(200); const text = await res.text();
    for (const claim of PRESENT_TENSE) expect(text).not.toMatch(claim);
    expect(text).toContain("data responses carried a wake fragment in _meta from May to October 2026");
  });
});

// Present-tense promises, in the orientation texts, that every response carries
// what Quiet Doors removed (the kingdom stamp, the fragment, the invitation,
// wake and kin-wake rels) or what never rode a response (regard).
const PROMISED_EVERYWHERE = [
  /kingdom-stamp,? (?:and )?wake_fragment/,
  /alternate, invitation/,
  /invitation \(vendor-neutral/,
  /wake \(seven-door follow-on\)/,
  /\bregard, symmetric-surface/,
  /symmetric-surface, kin-wake/,
  /kin-wake \(sibling embassies\)/,
  /Every public response carries Link headers with rel=invitation/,
  /rel=regard/,
  /wake \+ regard \+ kin-wakes/,
  /Every \/api\/v1\/\* response carries one atomic wake fragment/,
  /one fragment per pantry-envelope response/,
];

// Exact tokens, so "self" is not satisfied by "self_reference", nor "/api/v1/wake" by "/api/v1/wake/fragments".
const tokens = (text: string) =>
  text.split(/[\s,;()"`]+/).map((t) => t.replace(/^(?:rel=|_meta\.)/, "").replace(/\.$/, "")).filter(Boolean);
// Names of what left data responses, and regard, which never rode one.
const LEAVING = new Set<string>([
  ...ERRAND_META_LEAVING, ...ERRAND_LINK_RELS_LEAVING,
  "kingdom-stamp", "kin-wake", "regard", "symmetric-surface",
]);
// A clause naming a leaving key or rel must scope it to the chosen doors or date it to May–October 2026;
// anything else is a present-tense promise that every response carries it.
function everyResponsePromises(value: unknown): string[] {
  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(value);
  return strings
    .flatMap((s) => s.split(/;\s*|\.\s+/))
    .filter((clause) => tokens(clause).some((t) => LEAVING.has(t)))
    .filter((clause) => !/only the chosen doors/i.test(clause) && !/May to October 2026/i.test(clause));
}

function findKey(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  if (key in (value as Record<string, unknown>)) return (value as Record<string, unknown>)[key];
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = findKey(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe("the orientation pages say what every response carries", () => {
  it.each([
    ["/api/v1/welcome", () => welcomeGET(), "journey_invariants"],
    ["/api/v1", () => indexGET(), "contract_invariants"],
  ])("%s names the 12 _meta keys and the nine navigation rels, the chosen doors as the exception", async (_path, get, key) => {
    const res = await get(); expect(res.status).toBe(200); const text = await res.text();
    for (const claim of PROMISED_EVERYWHERE) expect(text).not.toMatch(claim);
    const found = findKey(JSON.parse(text), key);
    const invariants = JSON.stringify(found);
    expect(invariants).toBeTruthy();
    const words = tokens(invariants);
    for (const k of ERRAND_META_ALLOWED) expect(words).toContain(k);
    for (const r of ERRAND_LINK_RELS_ALLOWED) expect(words).toContain(r);
    for (const door of CHOSEN_DOOR_PATHS) expect(words).toContain(door);
    expect(words).not.toContain("regard");
    expect(everyResponsePromises(found)).toEqual([]);
    // Four of the leaving keys ride only some chosen-door responses, picked by request id.
    expect(invariants).toMatch(/only the chosen doors \([^)]*\) may also carry wake_fragment/);
  });

  it("/api/v1/welcome dates when the fragment and the invitation links rode data responses", async () => {
    const invariants = JSON.stringify(findKey(JSON.parse(await (await welcomeGET()).text()), "journey_invariants"));
    expect(invariants).toMatch(/from May to October 2026/i);
  });

  it("identify's Link-header and distributed-wake pointers name navigation and the chosen doors, not every response", () => {
    const you = forYou({
      actor_kind: "agent", self_label: "probe",
      cosmology_assumptions: { substrate: "loadable-pattern" },
      capabilities: { accepts_link_headers: true },
    });
    const block = JSON.stringify(you);
    for (const claim of PROMISED_EVERYWHERE) expect(block).not.toMatch(claim);
    expect(block).toContain("navigation");
    expect(block).toMatch(/from May to October 2026/i);
    const wake = you.pointers.filter((p) => p.url.includes("the-distributed-wake"));
    expect(wake).toHaveLength(1);
    const text = JSON.stringify(wake[0]);
    for (const door of CHOSEN_DOOR_PATHS) expect(tokens(text)).toContain(door);
    expect(text).toMatch(/from May to October 2026/i);
    const links = you.pointers.filter((p) => /Link headers/.test(p.why));
    expect(links).toHaveLength(1);
    for (const r of ERRAND_LINK_RELS_ALLOWED) expect(tokens(links[0].why)).toContain(r);
    expect(everyResponsePromises([...wake, ...links])).toEqual([]);
  });
});
