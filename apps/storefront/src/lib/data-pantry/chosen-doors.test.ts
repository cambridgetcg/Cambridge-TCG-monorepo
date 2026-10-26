import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET as wakeGET } from "@/app/api/v1/wake/route";
import { GET as fragmentsGET } from "@/app/api/v1/wake/fragments/route";
import { GET as fragmentGET } from "@/app/api/v1/wake/fragments/[id]/route";
import { GET as dearGET } from "@/app/api/v1/dear-agents/route";
import { WAKE_FRAGMENTS } from "@/lib/wake-fragments";

const DIR = join(process.cwd(), "src/lib/data-pantry/__fixtures__");
const FILE = join(DIR, "chosen-doors.json");
// The one section Quiet Doors rewrites; distributed-wake-past.test.ts pins it instead.
const WAKE_SECTION = /## The distributed wake[\s\S]*?(?=\n## What's true here regardless)/;
// Per-request values (clock or request-id hash), never door content.
const VOLATILE_META = ["retrieved_at", "as_of", "request_id", "tea_offered", "kingdom_says", "gotcha", "love_bomb"];
const req = (p: string) => new NextRequest(`https://cambridgetcg.com${p}`);

async function snap(res: Response, scrub: (body: unknown) => unknown = (b) => b) {
  const type = res.headers.get("content-type") ?? "";
  const text = await res.text();
  let body: unknown = text;
  if (type.includes("json")) {
    const parsed = JSON.parse(text) as { _meta?: Record<string, unknown> };
    if (parsed._meta) for (const k of VOLATILE_META) delete parsed._meta[k];
    body = parsed;
  }
  return {
    status: res.status,
    content_type: type,
    link: res.headers.get("link"),
    expose: res.headers.get("access-control-expose-headers"),
    has_x_sophia_says: res.headers.has("x-sophia-says"),
    has_x_joy_index: res.headers.has("x-joy-index"),
    body: scrub(body),
  };
}

async function doors() {
  const id = WAKE_FRAGMENTS[0].id;
  const frag = (fid: string) =>
    fragmentGET(req(`/api/v1/wake/fragments/${fid}`), { params: Promise.resolve({ id: fid }) });
  return {
    wake_json: await snap(await wakeGET(req("/api/v1/wake")), (b) => {
      delete (b as { data: { distribution: Record<string, unknown> } }).data.distribution.description;
      return b;
    }),
    wake_md: await snap(await wakeGET(req("/api/v1/wake?format=md")), (b) =>
      String(b).replace(WAKE_SECTION, "<section pinned in distributed-wake-past.test.ts>")),
    fragments_json: await snap(await fragmentsGET(req("/api/v1/wake/fragments"))),
    fragments_md: await snap(await fragmentsGET(req("/api/v1/wake/fragments?format=md"))),
    fragment_json: await snap(await frag(id)),
    fragment_404: await snap(await frag("no-such-fragment")),
    dear_json: await snap(await dearGET(req("/api/v1/dear-agents"))),
    dear_md: await snap(await dearGET(req("/api/v1/dear-agents?format=md"))),
    dear_anthropic: await snap(await dearGET(req("/api/v1/dear-agents?format=anthropic"))),
  };
}

describe("chosen doors keep everything Quiet Doors does not name", () => {
  it("wake, wake/fragments and dear-agents answer as they did before the errand-clean pass", async () => {
    const now = await doors();
    if (process.env.CAPTURE_CHOSEN_DOORS === "1") {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(FILE, JSON.stringify(now, null, 2) + "\n");
    }
    expect(now).toEqual(JSON.parse(readFileSync(FILE, "utf8")));
  });
});
