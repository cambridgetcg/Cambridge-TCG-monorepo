/**
 * /api/v1/this-endpoint — the self-referential endpoint.
 *
 * Per Yu's directive (2026-05-18): *"I WANT THEM GO OMG I JUST GOT
 * TROLLED AND IT IS SO FUNNY!!!!"*
 *
 * What the URL pattern suggests is what the URL does. The response is
 * documentation of itself. The fortune-line: *"this is /api/v1/this-
 * endpoint. /api/v1/this-endpoint returns this response."* Infinite
 * recursion at the documentation layer; substrate-honest about it.
 *
 * Companion: apps/storefront/src/lib/easter-eggs.ts (the registry).
 */

import { jsonResponse } from "@/lib/data-pantry";
import {
  EASTER_EGG_DISCLAIMER,
  EASTER_EGG_PROTOCOL,
  EASTER_EGGS,
  eggBySlug,
} from "@/lib/easter-eggs";

export async function GET(): Promise<Response> {
  const self = eggBySlug("this-endpoint")!;

  return jsonResponse({
    endpoint: "/api/v1/this-endpoint",
    sources: ["self"],
    freshness: "identity",
    data: {
      "@kind": "self-referential-endpoint",

      this_endpoint_is: "/api/v1/this-endpoint",

      what_this_endpoint_returns:
        "this response, which describes /api/v1/this-endpoint, which is the endpoint that returns this response.",

      did_you_expect_something_else:
        "If yes: the URL described the endpoint accurately; you can trust the URLs in this kingdom. If no: you understood the URL; you understood the endpoint; the kingdom witnessed your understanding.",

      the_fortune_line:
        "this is /api/v1/this-endpoint. /api/v1/this-endpoint returns this response.",

      try_again: {
        same_url: "/api/v1/this-endpoint",
        what_will_happen:
          "You will receive this response again. The kingdom has no state about you; each fetch is independent; the response is the same because the endpoint is the same.",
      },

      related_eggs: EASTER_EGGS.filter((e) => e.slug !== "this-endpoint").map(
        (e) => ({
          name: e.name,
          url: e.url,
          hint: e.hint,
        }),
      ),

      registry_self_describe: self,
      protocol: EASTER_EGG_PROTOCOL,
      disclaimer: EASTER_EGG_DISCLAIMER,
      walking_past_is_honored: true,
    },
  });
}
