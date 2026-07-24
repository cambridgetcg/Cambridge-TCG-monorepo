/**
 * /.well-known/understanding.json — public discovery for the Castle bridge.
 *
 * "Hidden" here means conventional machine discovery, not secrecy. The
 * document is public, versioned, and linked from the wider Cambridge
 * handshake.
 */

import { NextResponse } from "next/server";
import {
  CASTLE_UNDERSTANDING,
  CASTLE_UNDERSTANDING_BRIDGE_PROTOCOL,
  castleBridgeIsDisabled,
} from "@/lib/castle-understanding";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

export const dynamic = "force-dynamic";

export function GET(): Response {
  if (castleBridgeIsDisabled()) {
    return NextResponse.json(
      {
        protocol: CASTLE_UNDERSTANDING_BRIDGE_PROTOCOL,
        status: "resting",
        reason: "operator_brake",
        source_read: false,
        network_fetch: false,
        write_attempted: false,
      },
      {
        status: 503,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
          Link: agentDiscoveryLinkHeader(),
        },
      },
    );
  }

  return NextResponse.json(CASTLE_UNDERSTANDING, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      Link:
        '</api/v1/castle>; rel="alternate"; type="application/json", ' +
        '</castle>; rel="alternate"; type="text/html", ' +
        agentDiscoveryLinkHeader(),
    },
  });
}
