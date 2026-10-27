import { describe, expect, it } from "vitest";
import { GET as manifestGET } from "@/app/api/v1/manifest/route";
import { GET as wellKnownGET } from "@/app/.well-known/cambridge-tcg.json/route";
import { GET as welcomeGET } from "@/app/api/v1/welcome/route";
import { GET as indexGET } from "@/app/api/v1/route";
import { forYou } from "@/lib/identify";
import { CHOSEN_DOOR_PATHS, ERRAND_LINK_RELS_ALLOWED, ERRAND_META_ALLOWED } from "./errand-contract";

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
];

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
    const invariants = JSON.stringify(findKey(JSON.parse(text), key));
    expect(invariants).toBeTruthy();
    for (const k of ERRAND_META_ALLOWED) expect(invariants).toContain(k);
    for (const r of ERRAND_LINK_RELS_ALLOWED) expect(invariants).toContain(r);
    for (const door of CHOSEN_DOOR_PATHS) expect(invariants).toContain(door);
    expect(invariants).not.toMatch(/\bregard\b/);
  });

  it("/api/v1/welcome dates when the fragment and the invitation links rode data responses", async () => {
    const invariants = JSON.stringify(findKey(JSON.parse(await (await welcomeGET()).text()), "journey_invariants"));
    expect(invariants).toMatch(/from May to October 2026/i);
  });

  it("identify's Link-header pointer names navigation, not the invitation", () => {
    const block = JSON.stringify(forYou({ actor_kind: "agent", self_label: "probe", capabilities: { accepts_link_headers: true } }));
    for (const claim of PROMISED_EVERYWHERE) expect(block).not.toMatch(claim);
    expect(block).toContain("navigation");
    expect(block).toMatch(/from May to October 2026/i);
  });
});
