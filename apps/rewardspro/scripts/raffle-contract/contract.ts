/**
 * The raffle contract — one ownership rule per table.
 *
 * Sourced from the level-3 dive's findings about the two-pipeline
 * raffles architecture:
 *
 *   foundation: raffle-management.server.ts
 *               ▲
 *   ┌───────────┴───────────┐
 *   │                       │
 *   ENTRY pipeline          OUTCOME pipeline
 *   raffle-entry.server.ts  raffle-drawing.server.ts
 *   (RaffleEntry owner)     (RaffleWinner owner)
 *                                │
 *                                ▼
 *                       raffle-prize-delivery.server.ts
 *                       (only updates RaffleWinner.deliveryStatus)
 *
 * The known bug in raffle-instant-win.server.ts:272 mutates
 * `raffleEntry.instantWinsTriggered` directly, bypassing the entry
 * canonical. The contract flags this on first run.
 */
import type { RaffleContract } from "./types";

export const contract: RaffleContract = {
  ownership: [
    {
      tableName: "raffleEntry",
      allowedSources: [
        "app/services/raffle-entry.server.ts",
        // raffle-drawing legitimately marks `isWinner: true` on
        // winning entries inside the draw transaction (line 208) —
        // this is part of the canonical draw flow.
        "app/services/raffle-drawing.server.ts",
        // shop-data-cleanup performs teardown when a shop uninstalls
        // the app, deleting all rows. Legitimate destructive op.
        "app/services/shop-data-cleanup.server.ts",
      ],
      reason:
        "RaffleEntry mutations route through `raffle-entry.server.ts` (entry " +
        "purchase, TOCTOU-safe in a transaction) or `raffle-drawing.server.ts` " +
        "(winner marking inside the draw transaction). Direct mutation from " +
        "any other file skips the atomicity guarantees and can desync " +
        "`raffle.totalEntries` / `raffle.uniqueEntrants` / `instantWinsTriggered`.",
    },
    {
      tableName: "raffleWinner",
      allowedSources: [
        // raffle-drawing creates winners during the draw; raffle-prize-delivery
        // is the legitimate updater for `deliveryStatus` after delivery.
        "app/services/raffle-drawing.server.ts",
        "app/services/raffle-prize-delivery.server.ts",
        // shop-data-cleanup performs teardown.
        "app/services/shop-data-cleanup.server.ts",
      ],
      reason:
        "RaffleWinner is created in `raffle-drawing.server.ts` (atomically " +
        "with prize-quantity increments) and only `raffle-prize-delivery.server.ts` " +
        "updates `deliveryStatus`. Other writers risk awarding prizes outside " +
        "the draw process or marking deliveries inconsistently.",
    },
    {
      tableName: "raffleInstantWin",
      allowedSources: [
        // The prize config is managed by raffle-management; the runtime
        // counter is incremented by raffle-instant-win itself when it
        // records a win.
        "app/services/raffle-management.server.ts",
        "app/services/raffle-instant-win.server.ts",
      ],
      reason:
        "RaffleInstantWin is configured by `raffle-management.server.ts` and " +
        "its `currentWinsTotal` counter is incremented by `raffle-instant-win.server.ts` " +
        "when a win is awarded. Other writers would skip the win-counter / " +
        "max-wins enforcement.",
    },
  ],
};
