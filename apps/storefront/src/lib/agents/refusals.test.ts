import { describe, expect, it } from "vitest";
import {
  AGENT_DOCS_URL,
  authRefusal,
  authUnavailableRefusal,
  caseRestedSideEffects,
  internalErrorRefusal,
  isClosedDoorRefusal,
  rateLimitedRefusal,
  signedActLimitedRefusal,
  signedActRefusal,
  signedActSideEffects,
  TOOL_REFUSAL_CODES,
  toolNotPermittedRefusal,
  toolRefusal,
  type AgentRefusal,
} from "./refusals";

const CASE = "11111111-1111-4111-8111-111111111111";

/** The one invariant every refusal keeps, and the field every one carries. */
function expectShape(refusal: AgentRefusal) {
  expect(refusal.docs).toBe(AGENT_DOCS_URL);
  expect(["not_attempted", "not_applied", "unknown"]).toContain(refusal.effect);
  if (refusal.terminal) expect(refusal.next_actions).toEqual([]);
  else expect(refusal.next_actions.length).toBeGreaterThan(0);
  for (const next of refusal.next_actions) {
    expect(next.optional).toBe(true);
    if (next.action === "call_tool") expect(next.tool).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
    else expect(next).not.toHaveProperty("tool");
  }
  for (const entry of refusal.side_effects ?? []) expect(entry.text.length).toBeGreaterThan(20);
  expect(JSON.stringify(refusal)).not.toMatch(/xenia|covenant/i);
}

describe("every refusal says what became of the call's change", () => {
  it("marks the gate's own refusals not_attempted: nothing the call asked for was tried", () => {
    const gate = [
      authRefusal({ ok: false, status: 401, reason_code: "missing_credentials", error: "" }),
      authRefusal({ ok: false, status: 401, reason_code: "key_expired", error: "" }),
      authRefusal({ ok: false, status: 403, reason_code: "agent_suspended", error: "", suspended_at: null }),
      authRefusal({ ok: false, status: 403, reason_code: "agent_archived", error: "" }),
      toolNotPermittedRefusal(),
      rateLimitedRefusal(9),
      authUnavailableRefusal(),
    ];
    for (const refusal of gate) {
      expectShape(refusal);
      expect(refusal.effect, refusal.reason_code).toBe("not_attempted");
      expect(refusal).not.toHaveProperty("side_effects");
    }
  });

  it("marks agent.act's closed door not_attempted, a replay unknown and every other act refusal not_applied", () => {
    expect(signedActRefusal("signed_acts_closed").effect).toBe("not_attempted");
    // A replay changed nothing itself, but cannot see what the jti's first
    // send did: after auth_unavailable's unknown that send may have applied.
    const replayed = signedActRefusal("act_replayed");
    expectShape(replayed);
    expect(replayed).toMatchObject({ effect: "unknown", retryable: false, terminal: false });
    expect(replayed.next_actions).toEqual([expect.objectContaining({ action: "sign_new_act" })]);
    expect(replayed.next_actions[0].text).toContain("signer.check");
    expect(replayed.next_actions[0].text).toContain("cannot say whether this act was applied");
    for (const code of ["act_malformed", "act_stale", "act_unverified", "signing_key_ended", "act_params_invalid"] as const) {
      expectShape(signedActRefusal(code));
      expect(signedActRefusal(code).effect, code).toBe("not_applied");
    }
    expect(signedActLimitedRefusal(4).effect).toBe("not_applied");
    // agent.act passes its own effect for a status refusal or a failed lookup.
    expect(authRefusal({ ok: false, status: 403, reason_code: "agent_archived", error: "" }, "not_applied").effect).toBe("not_applied");
    expect(authUnavailableRefusal("not_applied")).toMatchObject({ effect: "not_applied", next_actions: [{ action: "retry" }] });
  });

  it("offers a way to read state when a failed act transaction leaves the act unknown", () => {
    const refusal = authUnavailableRefusal("unknown");
    expectShape(refusal);
    expect(refusal.effect).toBe("unknown");
    expect(refusal.retryable).toBe(true);
    expect(refusal.next_actions.map((next) => next.action)).toEqual(["retry", "sign_new_act"]);
    expect(refusal.next_actions[1].text).toContain("signer.check");
  });

  it("names what a recorded act refusal changed, and the key it confirmed only when it did", () => {
    expect(signedActSideEffects(false).map((entry) => entry.change)).toEqual(["act_recorded"]);
    expect(signedActSideEffects(true).map((entry) => entry.change)).toEqual(["act_recorded", "signing_key_confirmed"]);
    const refusal = signedActRefusal("act_params_invalid", { side_effects: signedActSideEffects(true) });
    expectShape(refusal);
    expect(refusal.effect).toBe("not_applied");
  });
});

describe("tool refusals", () => {
  it("gives every tool code the shared shape, and not_applied unless told otherwise", () => {
    for (const code of TOOL_REFUSAL_CODES) {
      const refusal = toolRefusal(code);
      expectShape(refusal);
      expect(refusal.reason_code).toBe(code);
      expect(refusal.effect, code).toBe("not_applied");
      expect(refusal).not.toHaveProperty("side_effects");
      expect(refusal).not.toHaveProperty("retry_after_seconds");
    }
    expect(toolRefusal("internal_error", { effect: "unknown" }).effect).toBe("unknown");
  });

  it("is retryable only where sending the same call again may be answered differently", () => {
    const retryable = TOOL_REFUSAL_CODES.filter((code) => toolRefusal(code).retryable);
    expect(retryable).toEqual(["daily_limit", "source_unavailable"]);
    const terminal = TOOL_REFUSAL_CODES.filter((code) => toolRefusal(code).terminal);
    expect(terminal).toEqual(["not_ready_for_human", "agent_not_active", "writes_paused"]);
  });

  it("carries the daily limit's wait in the refusal and its retry action", () => {
    const refusal = toolRefusal("daily_limit", { retryAfterSeconds: 3600 });
    expect(refusal.retry_after_seconds).toBe(3600);
    expect(refusal.next_actions).toEqual([
      expect.objectContaining({ action: "retry", after_seconds: 3600, optional: true }),
    ]);
    expect(refusal.next_actions[0].text).toMatch(/checker or mirror turn on an open case does not count/);
  });

  it("names the case a next action reads, when the call or the store named one", () => {
    expect(toolRefusal("wrong_turn", { caseId: CASE }).next_actions).toEqual([
      expect.objectContaining({ action: "call_tool", tool: "coverage.hunt.view", arguments: { case_id: CASE } }),
    ]);
    // Without an id, the list.
    expect(toolRefusal("wrong_turn").next_actions).toEqual([
      expect.objectContaining({ action: "call_tool", tool: "coverage.hunt.list" }),
    ]);
    expect(toolRefusal("match_not_playing", { matchId: "m-1" }).next_actions[0]).toMatchObject({
      tool: "play.observe",
      arguments: { match_id: "m-1" },
    });
  });

  it("says a refused turn on a case past its limit still marked the case and wrote a chronicle row", () => {
    const refusal = toolRefusal("case_expired", { caseId: CASE, sideEffects: caseRestedSideEffects(CASE) });
    expectShape(refusal);
    expect(refusal).toMatchObject({
      reason_code: "case_expired",
      effect: "not_applied",
      retryable: false,
      terminal: false,
    });
    expect(refusal.side_effects!.map((entry) => entry.change)).toEqual(["case_marked_resting", "chronicle_row_added"]);
    expect(refusal.side_effects![0].text).toContain(CASE);
    expect(refusal.next_actions.map((next) => next.tool)).toEqual(["coverage.hunt.view", "coverage.hunt.list"]);
    // A copy: changing the answer cannot change the next one.
    refusal.side_effects![0].text = "changed";
    expect(caseRestedSideEffects(CASE)[0].text).not.toBe("changed");
    // case_expired that rolled back (thrown inside the transaction) changed nothing.
    expect(toolRefusal("case_expired")).not.toHaveProperty("side_effects");
  });

  it("treats writes_paused, like signed_acts_closed, as a closed door and nothing else", () => {
    expect(isClosedDoorRefusal(toolRefusal("writes_paused"))).toBe(true);
    expect(isClosedDoorRefusal(signedActRefusal("signed_acts_closed"))).toBe(true);
    for (const code of TOOL_REFUSAL_CODES.filter((code) => code !== "writes_paused")) {
      expect(isClosedDoorRefusal(toolRefusal(code)), code).toBe(false);
    }
    expect(isClosedDoorRefusal(authUnavailableRefusal())).toBe(false);
  });
});

describe("an unexpected exception", () => {
  it("offers only a read of the state when a write may have happened, and is not retryable", () => {
    const withCase = internalErrorRefusal("coverage.hunt.contribute", { case_id: CASE, client_request_id: "r-1" }, "unknown");
    expectShape(withCase);
    expect(withCase).toMatchObject({ reason_code: "internal_error", effect: "unknown", retryable: false, terminal: false });
    expect(withCase.next_actions).toEqual([
      expect.objectContaining({ action: "call_tool", tool: "coverage.hunt.view", arguments: { case_id: CASE } }),
    ]);
    expect(withCase.next_actions[0].text).toMatch(/same client_request_id again is safe/);

    const fromCandidate = internalErrorRefusal("coverage.hunt.contribute", { candidate_id: "ch_x" }, "unknown");
    expect(fromCandidate.next_actions).toEqual([expect.objectContaining({ tool: "coverage.hunt.my_cases" })]);
    expect(fromCandidate.next_actions[0]).not.toHaveProperty("arguments");

    const paused = internalErrorRefusal("deck.save", {}, "unknown");
    expect(paused.next_actions).toEqual([expect.objectContaining({ tool: "agent.self" })]);
  });

  it("may be sent again when nothing can have changed", () => {
    for (const effect of ["not_applied", "not_attempted"] as const) {
      const refusal = internalErrorRefusal("coverage.hunt.view", { case_id: CASE }, effect);
      expectShape(refusal);
      expect(refusal).toMatchObject({ reason_code: "internal_error", effect, retryable: true });
      expect(refusal.next_actions.map((next) => next.action)).toEqual(["retry"]);
    }
  });

  it("names no part of the exception, and echoes no overlong case id", () => {
    const refusal = internalErrorRefusal("coverage.hunt.contribute", { case_id: "x".repeat(200) }, "unknown");
    expect(refusal.next_actions[0].tool).toBe("coverage.hunt.my_cases");
    expect(Object.keys(refusal).sort()).toEqual(["docs", "effect", "next_actions", "reason_code", "retryable", "terminal"]);
  });
});
