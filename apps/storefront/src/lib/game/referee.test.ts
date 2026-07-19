// A full refereed PvP match, both chairs human, no dice — every rule the
// referee applies cites the CR number it enforces.

import { describe, expect, it } from "vitest";
import { dealOpeningHands } from "./engine-setup";
import {
  refereeAttachDon,
  refereeAttack,
  refereeBeginTurn,
  refereeDefend,
  refereeEndTurn,
  refereeMulligan,
  otherSeat,
  type Seat,
} from "./referee";
import type { GameState } from "./types";
import type { SetupCard } from "./engine-setup";

function deck(prefix: string): SetupCard[] {
  const mk = (n: number, o: Partial<SetupCard> = {}): SetupCard => ({
    sku: `${prefix}${n}`, name: `${prefix}${n}`, cardNumber: `OP01-${String(n).padStart(3, "0")}`,
    imageUrl: null, rarity: "C", category: "character", cost: 1, power: 3000,
    counter: 1000, color: "red", ...o,
  });
  return [
    mk(1, { category: "leader", isLeader: true, power: 5000, life: 4, cost: null }),
    ...Array.from({ length: 20 }, (_, i) => mk(i + 2)),
  ];
}

function freshRefereeGame(): GameState {
  return dealOpeningHands("alice", "Alice", deck("A"), "bob", "Bob", deck("B"), "alice");
}

const seatOf = (s: GameState, id: string): Seat =>
  s.player1.userId === id ? "player1" : "player2";

describe("refereed PvP — official setup (CR 5-2-1-6/7)", () => {
  it("waits for BOTH mulligan decisions, then deals life", () => {
    let s = freshRefereeGame();
    expect(s.phase).toBe("setup");
    const r1 = refereeMulligan(s, "player1", false);
    expect(r1.rejected).toBeUndefined();
    s = r1.state;
    expect(s.phase).toBe("setup"); // still waiting on Bob
    expect(s.player1.life).toHaveLength(0);

    const r2 = refereeMulligan(s, "player2", true);
    s = r2.state;
    expect(s.phase).toBe("main");
    expect(s.player1.life).toHaveLength(4); // leader's printed life
    expect(s.player2.life).toHaveLength(4);
  });

  it("one mulligan decision per player (CR 5-2-1-6)", () => {
    let s = freshRefereeGame();
    s = refereeMulligan(s, "player1", true).state;
    const again = refereeMulligan(s, "player1", false);
    expect(again.rejected).toMatchObject({ ok: false, code: "already_decided" });
  });

  it("main-phase moves are gated until setup completes", () => {
    const s = freshRefereeGame();
    const r = refereeEndTurn(s, "player1");
    expect(r.rejected).toMatchObject({ ok: false, code: "setup_first" });
  });
});

describe("refereed PvP — the defense window across two humans", () => {
  function midGame(): GameState {
    let s = freshRefereeGame();
    s = refereeMulligan(s, "player1", false).state;
    s = refereeMulligan(s, "player2", false).state;
    // March to turn 3 so battles are legal (CR 6-5-6-1).
    s = refereeBeginTurn(s, "player1").state; // T1 upkeep
    s = refereeEndTurn(s, "player1").state;
    s = refereeBeginTurn(s, "player2").state; // T2
    s = refereeEndTurn(s, "player2").state;
    s = refereeBeginTurn(s, "player1").state; // T3
    return s;
  }

  it("an attack opens the window; the ATTACKER is locked, the DEFENDER must answer", () => {
    let s = midGame();
    const atk = refereeAttack(s, "player1", {
      attackerId: s.player1.leader!.id,
      targetType: "leader",
    });
    expect(atk.rejected).toBeUndefined();
    s = atk.state;
    expect(s.pendingDefense).toMatchObject({ defender: "player2" });

    // Attacker cannot act while the window is open.
    const locked = refereeEndTurn(s, "player1");
    expect(locked.rejected).toMatchObject({ code: "await_defense" });
    // Defender cannot make ordinary moves either — only defend.
    const wrongMove = refereeAttachDon(s, "player2", s.player2.leader!.id);
    expect(wrongMove.rejected).toMatchObject({ code: "defend_first" });
    // And the attacker cannot answer the window for them.
    const usurp = refereeDefend(s, "player1", {});
    expect(usurp.rejected).toMatchObject({ code: "not_defender" });
  });

  it("the defender's counter flips a tie (5000 vs 5000+1000)", () => {
    let s = midGame();
    s = refereeAttack(s, "player1", {
      attackerId: s.player1.leader!.id,
      targetType: "leader",
    }).state;
    const lifeBefore = s.player2.life.length;
    const counterCard = s.player2.hand.find((c) => (c.counter ?? 0) > 0)!;
    const def = refereeDefend(s, "player2", { counterCardIds: [counterCard.id] });
    expect(def.rejected).toBeUndefined();
    s = def.state;
    expect(s.player2.life).toHaveLength(lifeBefore); // miss — no damage
    expect(s.pendingDefense).toBeFalsy();
    expect(s.player2.trash.some((c) => c.id === counterCard.id)).toBe(true);
  });

  it("taking the hit loses a life card (ties favor the attacker, CR 7-1-4)", () => {
    let s = midGame();
    s = refereeAttack(s, "player1", {
      attackerId: s.player1.leader!.id,
      targetType: "leader",
    }).state;
    const lifeBefore = s.player2.life.length;
    s = refereeDefend(s, "player2", {}).state;
    expect(s.player2.life).toHaveLength(lifeBefore - 1);
    expect(s.player2.hand.length).toBeGreaterThan(5); // life card came to hand
  });

  it("a full refereed match ends in a win", () => {
    let s = midGame();
    let guard = 120;
    while (s.phase !== "finished" && guard-- > 0) {
      const active = seatOf(s, s.currentTurn) as Seat;
      if (s.pendingDefense) {
        s = refereeDefend(s, s.pendingDefense.defender, {}).state;
        continue;
      }
      const up = refereeBeginTurn(s, active);
      if (!up.rejected) s = up.state;
      const leader = s[active].leader!;
      const swing = refereeAttack(s, active, { attackerId: leader.id, targetType: "leader" });
      if (!swing.rejected) {
        s = swing.state;
        continue; // defender answers next loop
      }
      const end = refereeEndTurn(s, active);
      if (end.rejected) break;
      s = end.state;
    }
    expect(s.phase).toBe("finished");
    expect(["alice", "bob"]).toContain(s.winner);
  });
});
