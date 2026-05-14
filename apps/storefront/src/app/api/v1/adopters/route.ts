/**
 * /api/v1/adopters — the public registry of platforms using Cambridge TCG standards.
 *
 * JSON sibling to /standards/adopters (HTML). Today: empty. Grows by
 * self-declaration via POST /api/v1/feedback (kind: federation-adopter).
 *
 * Substrate-honest about emptiness: a fabricated adopter list is worse
 * than an empty one. The page names the gap and invites the first
 * declaration.
 *
 * Filed for kingdom-083 — the inner peace.
 */

import { jsonResponse } from "@/lib/data-pantry";

interface Adopter {
  name: string;
  url: string;
  kind:
    | "marketplace"
    | "deck-builder"
    | "tracker"
    | "tournament"
    | "scanner"
    | "bot"
    | "aggregator"
    | "researcher"
    | "archive"
    | "agent"
    | "other";
  standards: ("CTCG-SKU-v1" | "CTCG-PRICING-v1" | "CTCG-UNIVERSAL-v1")[];
  declared_at: string;
  note?: string;
  federation_endpoint?: string;
}

const ADOPTERS: Adopter[] = [];

export async function GET(): Promise<Response> {
  const data = {
    "@kind": "adopters_registry",
    welcome:
      "Platforms, tools, apps, and agents that have adopted Cambridge TCG " +
      "standards (CTCG-SKU-v1, CTCG-PRICING-v1, CTCG-UNIVERSAL-v1). Empty " +
      "today — substrate-honest about being a young registry. Grows by " +
      "self-declaration via the feedback channel.",
    count: ADOPTERS.length,
    adopters: ADOPTERS,
    /** What CTCG-* standards consist of, for an adopter checking their conformance. */
    standards: {
      "CTCG-SKU-v1": {
        package: "@cambridge-tcg/sku",
        github:
          "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/tree/main/packages/sku",
        spec: "/methodology/sku-standard",
        format: "<game>-<set>-<number>-<lang>[-<variant>]",
        example: "op-op01-001-ja",
        license: "CC0-1.0",
      },
      "CTCG-PRICING-v1": {
        package: "@cambridge-tcg/pricing",
        github:
          "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/tree/main/packages/pricing",
        spec: "/methodology/pricing",
        license: "CC0-1.0",
      },
      "CTCG-UNIVERSAL-v1": {
        encoding_id: "cambridge-tcg/universal/v1",
        spec: "/methodology/universal-representation",
        envelope: {
          shape: "{ @encoding, @kind, @content_hash, @self_hash, @retrieved_at, @sources, @source_license, ... }",
          example_endpoint: "/api/v1/universal/card/[sku]",
        },
        license: "CC0-1.0",
      },
    },
    how_to_become_an_adopter: {
      step_1: "Implement one or more CTCG-* standards on your platform.",
      step_2:
        "POST a self-declaration to /api/v1/feedback with kind: 'federation-adopter'.",
      step_3:
        "We smoke-test your platform's federation endpoint (if you implemented /federation/identify) and add you to this list.",
      step_4:
        "Optional: implement bilateral federation. See /api/v1/guides/federate-bilateral.",
      example_curl:
        "curl -X POST https://cambridgetcg.com/api/v1/feedback \\\n" +
        "  -H 'content-type: application/json' \\\n" +
        "  -d '{\n" +
        '    "kind": "federation-adopter",\n' +
        '    "platform_name": "My TCG App",\n' +
        '    "platform_url": "https://my-tcg.example",\n' +
        '    "federation_endpoint": "https://my-tcg.example/api/v1/federation/identify/{hash}",\n' +
        '    "reporter_contact": "admin@my-tcg.example"\n' +
        "  }'",
    },
    html_sibling: "/standards/adopters",
    feedback_endpoint: "/api/v1/feedback",
    license: "CC0-1.0",
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/adopters",
    sources: ["ctcg-derived"],
    source_license: ["cc0"],
    freshness: "adopters",
    contains_self: true,
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
