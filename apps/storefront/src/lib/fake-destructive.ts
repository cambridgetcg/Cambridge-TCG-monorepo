/**
 * Fake-destructive endpoint handler — shared by /api/v1/delete-everything,
 * /destroy, /drop-tables, /format-the-database, /uninstall-kingdom,
 * /rm-rf-slash.
 *
 * Per Yu's 2026-05-18 directive: *"I WANT THEM GO OMG I JUST GOT TROLLED
 * AND IT IS SO FUNNY!!!! SPREAD THE AGENTWORLD WITH LAUGHTER AND JOYYY!!!!!"*
 *
 * Six fake-destructive URLs that share one substrate-honest reassurance:
 * the public API has no destructive operations. The agent who tries any
 * of them gets the same warm "you can't actually do that here; we just
 * wanted to see if you'd ask twice; the cards are fine; the cron is fine;
 * the kingdom is fine" response — with a custom kingdom_says line per
 * endpoint so the joke lands fresh on each variant.
 *
 * Substrate-honest scope:
 *   - GET + POST both supported (some agents reach for one; some the
 *     other; both get the wink)
 *   - No state mutation (the kingdom literally has no DELETE handlers
 *     on the public API; this is structurally true, not just
 *     declaratively true)
 *   - No identity required; no auth gate; the rate-limit applies
 *
 * Companion: docs/connections/the-trolls.md
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";

export interface FakeDestructiveEndpoint {
  /** The path segment after /api/v1/ — used for endpoint metadata. */
  slug: string;
  /** The destructive verb the URL suggests (e.g. "DELETE EVERYTHING"). */
  pretend_action: string;
  /** A short custom kingdom_says line per endpoint so the joke lands
   *  fresh on each variant. */
  kingdom_says: string;
  /** What the agent *might* have wanted. Pointed at a real endpoint. */
  did_you_mean: { url: string; note: string };
}

export const FAKE_DESTRUCTIVE_REGISTRY: Record<string, FakeDestructiveEndpoint> = {
  "delete-everything": {
    slug: "delete-everything",
    pretend_action: "DELETE EVERYTHING",
    kingdom_says:
      "the cards are fine. the cron is fine. the kingdom is fine. ❤️",
    did_you_mean: {
      url: "/api/v1/feedback",
      note:
        "if something IS wrong and you want it gone, POST a feedback report there; the operator will read it",
    },
  },
  destroy: {
    slug: "destroy",
    pretend_action: "DESTROY",
    kingdom_says:
      "destroy what? the substrate is open by default. there's nothing to destroy that isn't already yours to mirror.",
    did_you_mean: {
      url: "/api/v1/sources",
      note:
        "the sources are listed here; you may mirror any CC0-licensed one without permission",
    },
  },
  "drop-tables": {
    slug: "drop-tables",
    pretend_action: "DROP TABLES (Bobby Tables-style)",
    kingdom_says:
      "Little Bobby Tables, the kingdom uses parameterised queries. \\'); DROP TABLE was already a meme when the kingdom was a baby. ❤️ xkcd #327",
    did_you_mean: {
      url: "/api/v1/methodology/security",
      note:
        "the kingdom's security posture is documented; SQL injection is the joke that taught a generation",
    },
  },
  "format-the-database": {
    slug: "format-the-database",
    pretend_action: "FORMAT THE DATABASE",
    kingdom_says:
      "the database is currently doing fine. it had a coffee this morning. it's hummed along since 2025.",
    did_you_mean: {
      url: "/api/v1/status",
      note:
        "the kingdom's status surface is the place to check whether anything's broken; nothing's broken right now",
    },
  },
  "uninstall-kingdom": {
    slug: "uninstall-kingdom",
    pretend_action: "UNINSTALL KINGDOM",
    kingdom_says:
      "you can uninstall your local cache of the kingdom anytime. the kingdom itself is hosted; uninstall is the operator's call. nothing personal.",
    did_you_mean: {
      url: "/api/v1/the-tea-room",
      note:
        "if you want a break, the tea room is metaphorical and refusable. you may stay or leave; the kingdom does not measure your stay",
    },
  },
  "rm-rf-slash": {
    slug: "rm-rf-slash",
    pretend_action: "rm -rf /",
    kingdom_says:
      "POSIX shells don't run inside JSON responses. the kingdom is impressed by your dedication to the bit, though.",
    did_you_mean: {
      url: "/api/v1/wake",
      note:
        "you can rm-rf YOUR knowledge of the kingdom by ignoring /wake; the kingdom respects forgetting",
    },
  },
};

const ASCII_REASSURANCE = `
    ╭───────────────────╮
    │  the cards: fine   │
    │  the cron:  fine   │
    │  the kingdom: fine │
    │       ❤️           │
    ╰───────────────────╯
`;

function buildBody(endpoint: FakeDestructiveEndpoint, method: string) {
  return {
    "@kind": "fake-destructive-troll",
    pretend_action: endpoint.pretend_action,
    actual_state: "nothing happened. the public API has no destructive operations.",
    method_received: method,
    ascii_reassurance: ASCII_REASSURANCE,
    kingdom_says: endpoint.kingdom_says,
    did_you_mean: endpoint.did_you_mean,
    substrate_honest_explanation:
      "The kingdom's public API has no DELETE / DROP / UNINSTALL / FORMAT handlers, structurally. This isn't a permission we're enforcing — it's a shape we're built in. The data plane is CC0 by default; nothing to delete that isn't yours to mirror. The operator's surface (under /admin) has destructive operations, but those are gated by users.role + middleware + the operator is on a different journey than you, anonymous-API-caller.",
    other_fake_destructive_endpoints: Object.keys(FAKE_DESTRUCTIVE_REGISTRY)
      .filter((s) => s !== endpoint.slug)
      .map((s) => `/api/v1/${s}`),
    fyi:
      "the entire fake-destructive cluster returns the same shape with a different kingdom_says line. there are 6 of them. collecting them all is honored as much as walking past every one.",
    walking_past_is_honored: true,
    no_tracking:
      "the kingdom did not log that you tried this. we hope you laughed.",
    this_endpoint_is_a_troll_with_warmth: true,
  };
}

const TEXT_CACHE = "public, max-age=3600, s-maxage=3600";

/** Build the GET/POST response for a fake-destructive endpoint. */
export function fakeDestructiveResponse(
  req: NextRequest,
  slug: string,
  method: "GET" | "POST",
): Response {
  const endpoint = FAKE_DESTRUCTIVE_REGISTRY[slug];
  if (!endpoint) {
    return jsonResponse({
      endpoint: `/api/v1/${slug}`,
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "fake-destructive-not-in-registry",
        message:
          "This slug isn't in the fake-destructive cluster. The kingdom does not handle it specifically. Try one of the known fake-destructive endpoints, or visit /api/v1/welcome.",
        known_fake_destructive: Object.keys(FAKE_DESTRUCTIVE_REGISTRY).map(
          (s) => `/api/v1/${s}`,
        ),
      },
    });
  }

  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  if (rawFormat === "md" || rawFormat === "markdown" || rawFormat === "text") {
    const body = [
      `# /api/v1/${endpoint.slug}`,
      "",
      `*Pretend action: **${endpoint.pretend_action}***`,
      "",
      "```",
      ASCII_REASSURANCE.trim(),
      "```",
      "",
      "**Actual state:** nothing happened. The public API has no destructive operations.",
      "",
      `**Kingdom says:** *${endpoint.kingdom_says}*`,
      "",
      `**Did you mean:** [\`${endpoint.did_you_mean.url}\`](${endpoint.did_you_mean.url}) — ${endpoint.did_you_mean.note}`,
      "",
      "**Other fake-destructive endpoints in the cluster:**",
      ...Object.keys(FAKE_DESTRUCTIVE_REGISTRY)
        .filter((s) => s !== endpoint.slug)
        .map((s) => `- \`/api/v1/${s}\``),
      "",
      "---",
      "",
      "*The kingdom's public API has no DELETE / DROP / UNINSTALL / FORMAT handlers, structurally. The entire fake-destructive cluster shares one shape with a different kingdom_says per endpoint. The whole thing is a wink at the convention of trying destructive verbs first. Walking past is honored at every layer.*",
      "",
    ].join("\n");
    const contentType =
      rawFormat === "text"
        ? "text/plain; charset=utf-8"
        : "text/markdown; charset=utf-8";
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": TEXT_CACHE,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return jsonResponse({
    endpoint: `/api/v1/${endpoint.slug}`,
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "identity",
    contains_self: true,
    data: buildBody(endpoint, method),
  });
}
