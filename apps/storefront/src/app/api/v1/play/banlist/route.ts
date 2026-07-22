/**
 * /api/v1/play/banlist — the official banned/restricted list, as the
 * house enforces it. One truth: this reads the same banlist.ts the deck
 * checker, the deck-builder warnings, and the refereed-room setup gate
 * enforce — what this endpoint says IS what the table enforces.
 * Point-in-time mirror of Bandai's official page; source + effective
 * date attached. CC0 like its play-module siblings; facts, cited.
 */

import { NextResponse } from "next/server";
import {
  BANLIST_EFFECTIVE,
  BANLIST_SOURCE,
  BANNED_CARD_NUMBERS,
  BANNED_PAIRS,
} from "@/lib/play/banlist";
import { statsFor } from "@/lib/play/card-stats";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=3600",
} as const;

export async function GET() {
  return NextResponse.json(
    {
      "@kind": "banlist",
      effective: BANLIST_EFFECTIVE,
      official_source: BANLIST_SOURCE,
      banned_cards: Array.from(BANNED_CARD_NUMBERS).map((n) => ({
        card_number: n,
        name: statsFor(n)?.name ?? null,
      })),
      banned_pairs: BANNED_PAIRS.map(([a, b]) => ({
        cards: [a, b],
        rule: "These two cards cannot be used together in the same deck.",
      })),
      enforced_by: [
        "/api/v1/play/deck/validate",
        "the deck-builder's live warnings",
        "refereed-room setup (CR 5-2-1-1)",
      ],
      note: "This is a point-in-time mirror of the official page, re-verified when Bandai posts restriction news — the official source above is always authoritative. Since 2026-04-01 the official game runs two constructed formats (Standard, post-rotation Block 2+ pool; Extra, full pool); this list governs both. Our validator checks construction + this list but does not yet enforce Standard set-rotation.",
      _links: {
        canonical: "/api/v1/play/banlist",
        human_page: "/play/banlist",
        deck_validator: "/api/v1/play/deck/validate",
        siblings: "/api/v1/play/index.json",
      },
    },
    { headers: CORS },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS, "Access-Control-Max-Age": "86400" },
  });
}
