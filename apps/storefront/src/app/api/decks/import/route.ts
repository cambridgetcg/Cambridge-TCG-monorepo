/**
 * POST /api/decks/import — temporarily paused.
 *
 * The previous anonymous route expanded one small body into one wholesale
 * request per distinct caller-controlled set prefix using unbounded
 * Promise.all. It also returned mixed-mirror membership resolution. Reopen
 * only with real deck bounds, bounded concurrency and an approved structural
 * catalog source.
 */

import { NextResponse } from "next/server";

export async function POST(_request: Request): Promise<Response> {
  return NextResponse.json(
    {
      error: {
        code: "DECK_IMPORT_PAUSED",
        message:
          "Deck import is paused while catalog resolution is rebuilt with bounded work and an approved public source.",
      },
      parsed: false,
      resolved: false,
      does_not_include: [
        "wholesale or database requests",
        "catalog membership resolution",
        "imported names, images, rarity, set metadata, prices, or stock",
      ],
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "300",
        "X-Content-License": "NOASSERTION",
      },
    },
  );
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
