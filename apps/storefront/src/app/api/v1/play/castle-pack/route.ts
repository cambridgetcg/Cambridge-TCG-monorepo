/**
 * Stateless referee for Castle of Understanding — Open Door.
 *
 * The caller carries the complete open-table state. The route validates it,
 * applies exactly one enumerated action, and stores nothing.
 */

import { NextResponse } from "next/server";
import { castlePackIsDisabled } from "@/lib/castle-pack-availability";
import { CASTLE_PACK, CASTLE_PACK_CARDS } from "@/lib/play/castle-pack";
import { PLAY_API_SIBLINGS } from "@/lib/play/resources";
import {
  CASTLE_GAME_PROTOCOL,
  CASTLE_MAX_ACTIONS,
  CastleGameError,
  applyAction,
  assertValidCastleGame,
  castleGameReceipt,
  createGame,
  legalActions,
  type CastleGameAction,
  type CastleOpenDoorGame,
} from "@/lib/play/castle-pack-game";

export const dynamic = "force-dynamic";

const BODY_LIMIT_BYTES = 128 * 1024;
const SEED_LIMIT = 80;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
} as const;

const CUSTODY = {
  mode: "caller_carried_open_table",
  stored_server_side: false,
  hidden_information: false,
  result_has_standing: false,
  account_created: false,
  rewards_created: false,
  note:
    "You carry both seats, hands, decks, stacks, and Chronicle. The referee validates one move but cannot prove honest custody, identity, consent, or a remote opponent.",
} as const;

async function readBodyWithinLimit(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    byteLength += value.byteLength;
    if (byteLength > BODY_LIMIT_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

function assertExactOperationKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
  operation: string,
): void {
  const unexpected = Object.keys(input).filter(
    (key) => !allowed.includes(key),
  );
  if (unexpected.length > 0) {
    throw new CastleGameError(
      "invalid_body",
      `${operation} does not accept: ${unexpected.join(", ")}.`,
    );
  }
}

function errorResponse(
  code: string,
  message: string,
  status = 400,
): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: CORS },
  );
}

function restedResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "CASTLE_PACK_RESTING",
        message:
          "The Open Door table is resting under its operator brake. No game state was read, changed, or stored.",
        details: {
          status: "resting",
          state_read: false,
          state_changed: false,
          stored_server_side: false,
        },
      },
    },
    { status: 503, headers: CORS },
  );
}

function seedFrom(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new CastleGameError("invalid_seed", "seed must be a string.");
  }
  if (value.length > SEED_LIMIT) {
    throw new CastleGameError(
      "invalid_seed",
      `seed must be at most ${SEED_LIMIT} characters.`,
    );
  }
  return value;
}

function gameResponse(game: CastleOpenDoorGame): NextResponse {
  return NextResponse.json(
    {
      "@kind": "castle_open_door_step",
      protocol: CASTLE_GAME_PROTOCOL,
      game,
      receipt: castleGameReceipt(game),
      legal_actions: legalActions(game),
      terminal: game.status !== "playing",
      result: game.result,
      custody: CUSTODY,
      limits: {
        rounds: 6,
        actions: CASTLE_MAX_ACTIONS,
        request_bytes: BODY_LIMIT_BYTES,
        seed_characters: SEED_LIMIT,
      },
      _links: {
        canonical: "/api/v1/play/castle-pack",
        table: "/play/castle-pack",
        play_index: "/api/v1/play/index.json",
        castle_boundary: "/api/v1/castle",
        methodology: "docs/connections/the-open-door-pack.md",
        openapi:
          "/api/openapi.json#/paths/~1api~1v1~1play~1castle-pack/post",
        see_also: PLAY_API_SIBLINGS,
      },
    },
    { headers: CORS },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  if (castlePackIsDisabled()) return restedResponse();

  const announcedLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(announcedLength) && announcedLength > BODY_LIMIT_BYTES) {
    return errorResponse(
      "BODY_TOO_LARGE",
      `Request body must be at most ${BODY_LIMIT_BYTES} bytes.`,
      413,
    );
  }

  const raw = await readBodyWithinLimit(request);
  if (raw === null) {
    return errorResponse(
      "BODY_TOO_LARGE",
      `Request body must be at most ${BODY_LIMIT_BYTES} bytes.`,
      413,
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("INVALID_BODY", "Request body must be a JSON object.");
  }

  const input = body as Record<string, unknown>;
  try {
    if (input.op === "new") {
      assertExactOperationKeys(input, ["op", "seed"], "op:'new'");
      return gameResponse(createGame(seedFrom(input.seed)));
    }

    if (input.op === "move") {
      assertExactOperationKeys(input, ["op", "game", "move"], "op:'move'");
      assertValidCastleGame(input.game);
      if (!input.move || typeof input.move !== "object" || Array.isArray(input.move)) {
        throw new CastleGameError(
          "illegal_action",
          "op:'move' requires a move object.",
        );
      }
      return gameResponse(
        applyAction(
          input.game as CastleOpenDoorGame,
          input.move as CastleGameAction,
        ),
      );
    }

    if (input.op === "regrow") {
      assertExactOperationKeys(input, ["op", "game", "seed"], "op:'regrow'");
      assertValidCastleGame(input.game);
      return gameResponse(
        applyAction(input.game as CastleOpenDoorGame, {
          type: "regrow",
          seed: seedFrom(input.seed),
        }),
      );
    }

    return errorResponse(
      "UNKNOWN_OPERATION",
      'op must be "new", "move", or "regrow".',
    );
  } catch (error) {
    if (error instanceof CastleGameError) {
      return errorResponse(error.code.toUpperCase(), error.message);
    }
    console.error("[/api/v1/play/castle-pack]", error);
    return errorResponse(
      "REFEREE_ERROR",
      "The referee could not apply that operation.",
      500,
    );
  }
}

export function GET(): NextResponse {
  if (castlePackIsDisabled()) return restedResponse();

  return NextResponse.json(
    {
      "@kind": "castle_open_door_contract",
      protocol: CASTLE_GAME_PROTOCOL,
      pack: CASTLE_PACK,
      cards: CASTLE_PACK_CARDS,
      rules: {
        seats: 2,
        rounds: 6,
        opening_hand: 4,
        stacks_per_seat: 2,
        stack_capacity: 4,
        round_end: "Two consecutive passes.",
        load:
          "One per Room plus one per full four-Room stack. Load measures this board only, never a being's understanding or worth.",
        rest:
          "Either seat may stop at any time. The generation rests unfinished with no winner or penalty.",
        regrow:
          "Only a complete or rested game may deliberately start one new finite generation. Nothing regrows automatically.",
      },
      operations: {
        new: { method: "POST", body: { op: "new", seed: "optional <=80 chars" } },
        move: {
          method: "POST",
          body: {
            op: "move",
            game: "<previous game>",
            move: "<one exact legal_actions[] value>",
          },
        },
        regrow: {
          method: "POST",
          body: {
            op: "regrow",
            game: "<complete or rested game>",
            seed: "optional <=80 chars",
          },
        },
      },
      custody: CUSTODY,
      limits: {
        rounds: 6,
        actions: CASTLE_MAX_ACTIONS,
        request_bytes: BODY_LIMIT_BYTES,
        seed_characters: SEED_LIMIT,
      },
      brake: {
        environment_variable: "CASTLE_PACK_DISABLED",
        disabled_value: "1",
        scope: "This table and referee only.",
      },
      _links: {
        canonical: "/api/v1/play/castle-pack",
        table: "/play/castle-pack",
        play_index: "/api/v1/play/index.json",
        castle_boundary: "/api/v1/castle",
        methodology: "docs/connections/the-open-door-pack.md",
        see_also: PLAY_API_SIBLINGS,
      },
    },
    { headers: CORS },
  );
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS,
      "Access-Control-Max-Age": "86400",
    },
  });
}
