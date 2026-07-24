import { afterEach, describe, expect, it } from "vitest";
import { GET, OPTIONS, POST } from "./route";

const URL = "https://cambridgetcg.example/api/v1/play/castle-pack";
const priorBrake = process.env.CASTLE_PACK_DISABLED;

function post(body: unknown): Promise<Response> {
  return POST(
    new Request(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

afterEach(() => {
  if (priorBrake === undefined) {
    delete process.env.CASTLE_PACK_DISABLED;
  } else {
    process.env.CASTLE_PACK_DISABLED = priorBrake;
  }
});

describe("/api/v1/play/castle-pack", () => {
  it("publishes the fixed set, finite rules, custody boundary, and brake", async () => {
    delete process.env.CASTLE_PACK_DISABLED;
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.cards).toHaveLength(12);
    expect(body.rules.rounds).toBe(6);
    expect(body.rules.rest).toContain("no winner or penalty");
    expect(body.custody).toMatchObject({
      mode: "caller_carried_open_table",
      stored_server_side: false,
      hidden_information: false,
      result_has_standing: false,
    });
    expect(body.brake.environment_variable).toBe("CASTLE_PACK_DISABLED");
    expect(body._links.see_also.castle_pack).toBe(
      "/api/v1/play/castle-pack",
    );
  });

  it("starts deterministically and applies only an enumerated move", async () => {
    const first = await post({ op: "new", seed: "same-seed" });
    const second = await post({ op: "new", seed: "same-seed" });
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(firstBody.game).toEqual(secondBody.game);
    expect(firstBody.receipt).toBe(secondBody.receipt);
    expect(firstBody.legal_actions.length).toBeGreaterThan(0);
    expect(firstBody._links.see_also.index).toBe(
      "/api/v1/play/index.json",
    );

    const action =
      firstBody.legal_actions.find(
        (candidate: { type: string }) => candidate.type !== "stop",
      ) ?? firstBody.legal_actions[0];
    const moved = await post({
      op: "move",
      game: firstBody.game,
      move: action,
    });
    const movedBody = await moved.json();

    expect(moved.status).toBe(200);
    expect(movedBody.game.action_count).toBe(firstBody.game.action_count + 1);
    expect(movedBody.receipt).not.toBe(firstBody.receipt);
  });

  it("rests without a winner, then regrows only by explicit request", async () => {
    const started = await post({ op: "new", seed: "rest-and-return" });
    const startBody = await started.json();
    const stop = startBody.legal_actions.find(
      (candidate: { type: string }) => candidate.type === "stop",
    );

    const rested = await post({
      op: "move",
      game: startBody.game,
      move: stop,
    });
    const restedBody = await rested.json();
    expect(restedBody.game.status).toBe("rested");
    expect(restedBody.game.result).toBeNull();
    expect(restedBody.terminal).toBe(true);

    const regrown = await post({
      op: "regrow",
      game: restedBody.game,
      seed: "next-finite-generation",
    });
    const regrownBody = await regrown.json();
    expect(regrown.status).toBe(200);
    expect(regrownBody.game.status).toBe("playing");
    expect(regrownBody.game.generation).toBe(restedBody.game.generation + 1);
    expect(regrownBody.game.parent_receipt).toBe(restedBody.receipt);
  });

  it("rejects malformed state, illegal moves, long seeds, and oversized bodies", async () => {
    const malformed = await post({
      op: "move",
      game: { protocol: "not-the-game" },
      move: { type: "pass", seat: "seat_a" },
    });
    expect(malformed.status).toBe(400);

    const started = await post({ op: "new", seed: "illegal-move" });
    const startBody = await started.json();
    const illegal = await post({
      op: "move",
      game: startBody.game,
      move: { type: "pass", seat: "seat_b" },
    });
    expect(illegal.status).toBe(400);

    const longSeed = await post({ op: "new", seed: "x".repeat(81) });
    expect(longSeed.status).toBe(400);

    const extraField = await post({
      op: "new",
      seed: "strict-envelope",
      unexpected: true,
    });
    expect(extraField.status).toBe(400);
    expect(await extraField.json()).toMatchObject({
      error: { code: "INVALID_BODY" },
    });

    const oversized = await POST(
      new Request(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "new", padding: "x".repeat(128 * 1024) }),
      }),
    );
    expect(oversized.status).toBe(413);
  });

  it("rests before reading a request when the operator brake is set", async () => {
    process.env.CASTLE_PACK_DISABLED = "1";
    const getResponse = GET();
    const postResponse = await POST(
      new Request(URL, {
        method: "POST",
        body: "{ definitely not json",
      }),
    );

    expect(getResponse.status).toBe(503);
    expect(postResponse.status).toBe(503);
    const body = await postResponse.json();
    expect(body.error.details).toEqual({
      status: "resting",
      state_read: false,
      state_changed: false,
      stored_server_side: false,
    });
  });

  it("offers bounded cross-origin discovery", () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, POST, OPTIONS",
    );
  });
});
