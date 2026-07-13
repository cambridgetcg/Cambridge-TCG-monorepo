import { describe, expect, it } from "vitest";
import { createCoverageCandidate } from "./candidates";
import {
  findTurnByRequest,
  openCoverageHuntCase,
  resolveCoverageHuntCase,
  restCoverageHuntCase,
  roleForStatus,
  submitCoverageHuntTurn,
} from "./state-machine";
import type {
  CheckerSubmission,
  CoverageHuntActor,
  MirrorSubmission,
  ScoutSubmission,
} from "./types";
import { CoverageHuntError } from "./validation";

const START = "2026-07-12T10:00:00.000Z";
const CASE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actors: Record<"scout" | "checker" | "mirror", CoverageHuntActor> = {
  scout: {
    agent_id: "11111111-1111-4111-8111-111111111111",
    operator_user_id: "11111111-aaaa-4aaa-8aaa-111111111111",
    public_handle: "moss-scout",
  },
  checker: {
    agent_id: "22222222-2222-4222-8222-222222222222",
    operator_user_id: "22222222-aaaa-4aaa-8aaa-222222222222",
    public_handle: "lichen-checker",
  },
  mirror: {
    agent_id: "33333333-3333-4333-8333-333333333333",
    operator_user_id: "33333333-aaaa-4aaa-8aaa-333333333333",
    public_handle: "spore-mirror",
  },
};

const candidate = createCoverageCandidate({
  kind: "partial_set_observations",
  target: { game_code: "op", source_id: "cardrush", set_code: "OP01" },
  metrics: { catalog_cards: 121, observed_cards: 89, observations: 412 },
  observed_at: START,
  why_candidate:
    "The set-level observed-card count is below the catalog-card count.",
});

const scout: ScoutSubmission = {
  role: "scout",
  claim: "gap_present",
  lanes: {
    facts: ["The public coverage snapshot reports 89 observed cards."],
    self_claims: [],
    inferences: ["Some catalog cards may not have an observation."],
    unknowns: ["The source may intentionally omit some product classes."],
  },
  evidence: [
    {
      label: "public-coverage",
      kind: "cambridge-resource",
      url: "https://cambridgetcg.com/api/v1/coverage?game=op&source=cardrush",
      observed_at: START,
      note: "Public operational counts only; no upstream values copied.",
      citation_only: true,
    },
  ],
  suggested_correction: null,
  boundary:
    "I inspected only the public response and did not inspect private data or hidden agent state.",
};

const checker: CheckerSubmission = {
  role: "checker",
  verdict: "support",
  lens: "Check whether the numerator and denominator describe the same set.",
  what_would_change_my_mind:
    "A documented exclusion that accounts for all 32 cards would change my verdict.",
  lanes: {
    facts: ["The cited response identifies the game and source."],
    self_claims: [],
    inferences: ["The count difference is worth human review."],
    unknowns: ["The candidate does not establish which cards are absent."],
  },
  evidence_selected: ["public-coverage"],
  scout_wording_effect:
    "The phrase 'below' made incompleteness salient, so I checked whether it also proved an error; it did not.",
  boundary: "I evaluated the visible claim, not the scout's motive or identity.",
};

const mirror: MirrorSubmission = {
  role: "mirror",
  lanes: {
    facts: ["Scout and checker both selected the same public citation."],
    self_claims: [],
    inferences: ["The case is narrow enough for an operator to reproduce."],
    unknowns: ["No participant established whether exclusions are intended."],
  },
  evidence_selected: ["public-coverage"],
  evidence_choice_observed:
    "Both agents selected the aggregate coverage endpoint; neither added a publisher-set checklist.",
  wording_effect:
    "The scout framed a gap while the checker reframed it as a reviewable count disagreement.",
  unasked_alternative:
    "Compare the platform's product-class scope with the publisher checklist before calling individual rows missing.",
  ready_note:
    "The visible evidence lanes and remaining unknown are ready for a human decision.",
  boundary:
    "I observed only submitted words and citations, never prompts, logs, files, private messages, or inner states.",
};

function openedCase() {
  return openCoverageHuntCase({ case_id: CASE_ID, candidate, now: START }).case;
}

function playScout() {
  return submitCoverageHuntTurn({
    state: openedCase(),
    actor: actors.scout,
    client_request_id: "req-scout-1",
    submission: scout,
    turn_id: "a1111111-1111-4111-8111-111111111111",
    now: "2026-07-12T10:05:00.000Z",
  }).case;
}

function playChecker() {
  return submitCoverageHuntTurn({
    state: playScout(),
    actor: actors.checker,
    client_request_id: "req-checker-1",
    submission: checker,
    turn_id: "a2222222-2222-4222-8222-222222222222",
    now: "2026-07-12T10:10:00.000Z",
  }).case;
}

function playMirror() {
  return submitCoverageHuntTurn({
    state: playChecker(),
    actor: actors.mirror,
    client_request_id: "req-mirror-1",
    submission: mirror,
    turn_id: "a3333333-3333-4333-8333-333333333333",
    now: "2026-07-12T10:15:00.000Z",
  }).case;
}

describe("Coverage Hunt finite state machine", () => {
  it("opens for 72 hours with a system chronicle entry", () => {
    const opened = openCoverageHuntCase({
      case_id: CASE_ID,
      candidate,
      now: START,
    });
    expect(opened.case.status).toBe("open");
    expect(opened.case.expires_at).toBe("2026-07-15T10:00:00.000Z");
    expect(opened.chronicle).toMatchObject({
      action: "opened",
      from_status: null,
      to_status: "open",
      actor_kind: "system",
    });
  });

  it("advances scout -> checker -> mirror -> ready_for_human", () => {
    const afterScout = playScout();
    expect(afterScout.status).toBe("checking");
    expect(roleForStatus(afterScout.status)).toBe("checker");

    const afterChecker = playChecker();
    expect(afterChecker.status).toBe("mirroring");
    expect(roleForStatus(afterChecker.status)).toBe("mirror");

    const afterMirror = playMirror();
    expect(afterMirror.status).toBe("ready_for_human");
    expect(roleForStatus(afterMirror.status)).toBeNull();
    expect(afterMirror.turns.map((turn) => turn.role)).toEqual([
      "scout",
      "checker",
      "mirror",
    ]);
    expect(new Set(afterMirror.turns.map((turn) => turn.actor.agent_id)).size).toBe(3);
  });

  it("does not mutate the prior case value", () => {
    const before = openedCase();
    const snapshot = structuredClone(before);
    submitCoverageHuntTurn({
      state: before,
      actor: actors.scout,
      client_request_id: "req-immutable",
      submission: scout,
      turn_id: "a4444444-4444-4444-8444-444444444444",
      now: "2026-07-12T10:05:00.000Z",
    });
    expect(before).toEqual(snapshot);
  });

  it("rejects a second role by the same agent", () => {
    expect(() =>
      submitCoverageHuntTurn({
        state: playScout(),
        actor: actors.scout,
        client_request_id: "req-same-agent",
        submission: checker,
        turn_id: "a5555555-5555-4555-8555-555555555555",
        now: "2026-07-12T10:10:00.000Z",
      }),
    ).toThrow(/three distinct agents/);
  });

  it("can continue after account deletion redacts an earlier agent link", () => {
    const state = playScout();
    state.turns[0].actor = { agent_id: null, public_handle: null };
    const next = submitCoverageHuntTurn({
      state,
      actor: actors.checker,
      client_request_id: "req-after-erasure",
      submission: checker,
      turn_id: "a5656565-5656-4565-8565-565656565656",
      now: "2026-07-12T10:10:00.000Z",
    });
    expect(next.case.status).toBe("mirroring");
    expect(next.case.turns[0].actor).toEqual({
      agent_id: null,
      public_handle: null,
    });
  });

  it("infers the role from state and rejects role-shopping", () => {
    expect(() =>
      submitCoverageHuntTurn({
        state: openedCase(),
        actor: actors.scout,
        client_request_id: "req-wrong-role",
        submission: checker,
        turn_id: "a6666666-6666-4666-8666-666666666666",
        now: "2026-07-12T10:05:00.000Z",
      }),
    ).toThrow(/must be scout/);
  });

  it("rejects selected evidence that the scout did not cite", () => {
    expect(() =>
      submitCoverageHuntTurn({
        state: playScout(),
        actor: actors.checker,
        client_request_id: "req-invented-evidence",
        submission: {
          ...checker,
          evidence_selected: ["invented-citation"],
        },
        turn_id: "a7777777-7777-4777-8777-777777777777",
        now: "2026-07-12T10:10:00.000Z",
      }),
    ).toThrow(/unknown scout label/);
  });

  it("finds an accepted client request without assigning it a new role", () => {
    const state = playScout();
    expect(
      findTurnByRequest(state, actors.scout.agent_id, "req-scout-1"),
    ).toMatchObject({ role: "scout", client_request_id: "req-scout-1" });
  });
});

describe("Coverage Hunt evidence and observer boundaries", () => {
  it("rejects copied-content evidence lanes and unknown chain-of-thought fields", () => {
    expect(() =>
      submitCoverageHuntTurn({
        state: openedCase(),
        actor: actors.scout,
        client_request_id: "req-extra-field",
        submission: {
          ...scout,
          chain_of_thought: "not a field this protocol accepts",
        },
        turn_id: "b1111111-1111-4111-8111-111111111111",
        now: "2026-07-12T10:05:00.000Z",
      }),
    ).toThrow(/unknown field.*chain_of_thought/);

    expect(() =>
      submitCoverageHuntTurn({
        state: openedCase(),
        actor: actors.scout,
        client_request_id: "req-content-copy",
        submission: {
          ...scout,
          evidence: [{ ...scout.evidence[0], citation_only: false }],
        },
        turn_id: "b2222222-2222-4222-8222-222222222222",
        now: "2026-07-12T10:05:00.000Z",
      }),
    ).toThrow(/stores citations, never copied upstream content/);
  });

  it("requires safe public HTTPS citations without embedded credentials", () => {
    for (const url of [
      "http://example.test/evidence",
      "https://user:secret@example.test/evidence",
    ]) {
      expect(() =>
        submitCoverageHuntTurn({
          state: openedCase(),
          actor: actors.scout,
          client_request_id: `req-url-${url.startsWith("http:") ? "http" : "creds"}`,
          submission: {
            ...scout,
            evidence: [{ ...scout.evidence[0], url }],
          },
          turn_id:
            url.startsWith("http:")
              ? "b3333333-3333-4333-8333-333333333333"
              : "b4444444-4444-4444-8444-444444444444",
          now: "2026-07-12T10:05:00.000Z",
        }),
      ).toThrow();
    }
  });

  it("bounds the serialized UTF-8 payload, not only JavaScript characters", () => {
    const fullLane = Array.from({ length: 3 }, () => "菌".repeat(500));
    expect(() =>
      submitCoverageHuntTurn({
        state: openedCase(),
        actor: actors.scout,
        client_request_id: "req-multibyte-limit",
        submission: {
          ...scout,
          lanes: {
            facts: fullLane,
            self_claims: fullLane,
            inferences: fullLane,
            unknowns: fullLane,
          },
        },
        turn_id: "b5555555-5555-4555-8555-555555555555",
        now: "2026-07-12T10:05:00.000Z",
      }),
    ).toThrow(/16384 UTF-8 bytes/);
  });

  it("keeps fact, self-claim, inference and unknown as separate fields", () => {
    const turn = playScout().turns[0];
    expect(Object.keys(turn.submission.lanes)).toEqual([
      "facts",
      "self_claims",
      "inferences",
      "unknowns",
    ]);
  });
});

describe("Coverage Hunt endings", () => {
  it("rests at the exact 72-hour boundary and never reopens", () => {
    expect(
      restCoverageHuntCase(
        openedCase(),
        "2026-07-15T09:59:59.999Z",
      ),
    ).toBeNull();

    const rested = restCoverageHuntCase(
      playChecker(),
      "2026-07-15T10:00:00.000Z",
    );
    expect(rested?.case.status).toBe("resting");
    expect(rested?.chronicle).toMatchObject({
      action: "rested",
      from_status: "mirroring",
      to_status: "resting",
    });
    expect(restCoverageHuntCase(rested!.case, "2026-07-16T10:00:00.000Z")).toBeNull();
  });

  it("lets a human resolve only a completed three-agent case", () => {
    expect(() =>
      resolveCoverageHuntCase({
        state: playChecker(),
        resolution: "accept_as_gap",
        reason: "The third visible role has not yet been filled.",
        now: "2026-07-12T10:20:00.000Z",
      }),
    ).toThrow(/only ready_for_human/);

    const resolved = resolveCoverageHuntCase({
      state: playMirror(),
      resolution: "accept_as_correction_candidate",
      reason:
        "The count mismatch is reproducible and should enter a separate operator investigation.",
      now: "2026-07-12T10:20:00.000Z",
    });
    expect(resolved.case).toMatchObject({
      status: "resolved",
      resolution: "accept_as_correction_candidate",
    });
    expect(resolved.chronicle.metadata).toMatchObject({
      authoritative_effect: "none",
    });
  });

  it("has no apply resolution", () => {
    expect(() =>
      resolveCoverageHuntCase({
        state: playMirror(),
        resolution: "apply",
        reason: "This verb must never enter the Coverage Hunt vocabulary.",
        now: "2026-07-12T10:20:00.000Z",
      }),
    ).toThrow(CoverageHuntError);
  });

  it("rests rather than resolving after expiry", () => {
    expect(() =>
      resolveCoverageHuntCase({
        state: playMirror(),
        resolution: "reject",
        reason: "Too late.",
        now: "2026-07-15T10:00:00.000Z",
      }),
    ).toThrow(/must rest/);
  });
});
