import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentActor } from "./auth";

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("./matchmaker", () => ({ finalizeMatch: vi.fn(), tickMatchmaker: vi.fn() }));

import { ToolError } from "./tool-error";
import { catalogSearch, leaderboardsRead, pricesRecent } from "./platform-tools";
import { playCancelQueue, playObserve, playQueueMatch, playTakeAction } from "./play-tools";
import { deckSave } from "./write-tools";
import { catalogLookupMany } from "./card-batch-tools";
import { CardBatchUnavailableError } from "@/lib/catalog/card-batch";

const actor: AgentActor = {
  kind: "agent",
  agentId: "11111111-1111-4111-8111-111111111111",
  agentPublicHandle: "gentle-scout",
  operatorUserId: "22222222-2222-4222-8222-222222222222",
  registeredVia: "operator",
  keyId: "33333333-3333-4333-8333-333333333333",
  rateLimitTier: "free",
  keyExpiresAt: null,
};

/** The ToolError a call threw: its status, message and refusal. */
async function refusedWith(call: () => Promise<unknown>) {
  const error = await call().then(
    () => {
      throw new Error("expected a ToolError");
    },
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(ToolError);
  return error as ToolError;
}

beforeEach(() => {
  mocks.query.mockReset();
  mocks.transaction.mockReset();
});

describe("ToolError", () => {
  it("keeps its message and status and carries the refusal built for its code", () => {
    const error = new ToolError("case_id is required", 400, "invalid_input");
    expect(error.message).toBe("case_id is required");
    expect(error.status).toBe(400);
    expect(error.refusal).toMatchObject({ reason_code: "invalid_input", effect: "not_applied", retryable: false, terminal: false });
    expect(new ToolError("x", 503, "internal_error", { effect: "unknown" }).refusal.effect).toBe("unknown");
  });
});

describe("every tool handler's refusal carries a reason code", () => {
  it("platform tools: arguments they refuse are invalid_input, 400", async () => {
    for (const call of [
      () => catalogSearch(actor, { q: "a" }),
      () => leaderboardsRead(actor, { kind: "humans" }),
      () => pricesRecent(actor, {}),
    ]) {
      const error = await refusedWith(call);
      expect(error.status).toBe(400);
      expect(error.refusal.reason_code).toBe("invalid_input");
    }
  });

  it("paused match and deck writes are writes_paused, a terminal 503, before any read", async () => {
    for (const call of [
      () => playTakeAction(actor, { match_id: "m", type: "concede" }),
      () => playQueueMatch(actor, { deck: [] }),
      () => playCancelQueue(actor),
      () => deckSave(actor, { name: "x", entries: [] }),
    ]) {
      const error = await refusedWith(call);
      expect(error.status).toBe(503);
      expect(error.refusal).toMatchObject({ reason_code: "writes_paused", terminal: true, next_actions: [], effect: "not_applied" });
    }
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("match reads: not found is match_not_found (404), another agent's match not_a_participant (403)", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    const missing = await refusedWith(() => playObserve(actor, { match_id: "m-0" }));
    expect([missing.status, missing.refusal.reason_code]).toEqual([404, "match_not_found"]);

    mocks.query.mockResolvedValueOnce({ rows: [{ agent_a_id: "other-a", agent_b_id: "other-b", game_state: null }] });
    const foreign = await refusedWith(() => playObserve(actor, { match_id: "m-1" }));
    expect([foreign.status, foreign.refusal.reason_code]).toEqual([403, "not_a_participant"]);

    mocks.query.mockResolvedValueOnce({ rows: [{ agent_a_id: actor.agentId, agent_b_id: "other-b", game_state: null }] });
    const stateless = await refusedWith(() => playObserve(actor, { match_id: "m-2" }));
    expect([stateless.status, stateless.refusal.reason_code]).toEqual([409, "match_state_missing"]);
  });

  it("card batch: bad input is invalid_input (400); a mirror outage is source_unavailable (503), retryable", async () => {
    const bad = await refusedWith(() => catalogLookupMany(actor, { skus: [] }));
    expect([bad.status, bad.refusal.reason_code]).toEqual([400, "invalid_input"]);

    const down = await refusedWith(() =>
      catalogLookupMany(actor, { skus: ["op-op01-001-ja"] }, async () => {
        throw new CardBatchUnavailableError(new Error("connection refused"));
      }),
    );
    expect([down.status, down.refusal.reason_code, down.refusal.retryable]).toEqual([503, "source_unavailable", true]);
  });
});
