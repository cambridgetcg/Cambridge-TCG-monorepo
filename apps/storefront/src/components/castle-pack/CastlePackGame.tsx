"use client";

import { useMemo, useState } from "react";
import {
  CASTLE_PACK_CARDS,
  castlePackCard,
  type CastlePackCardId,
  type CastlePackMark,
} from "@/lib/play/castle-pack";
import {
  applyAction,
  createGame,
  legalActions,
  type CastleGameAction,
  type CastleOpenDoorGame,
  type CastleSeat,
} from "@/lib/play/castle-pack-game";

const SEAT_NAME: Record<CastleSeat, string> = {
  seat_a: "Seat A",
  seat_b: "Seat B",
};

const MARK_NAME: Record<CastlePackMark, string> = {
  lantern: "Lantern",
  mirror: "Mirror",
  gate: "Gate",
};

function CardFace({
  id,
  compact = false,
}: {
  id: CastlePackCardId;
  compact?: boolean;
}) {
  const card = castlePackCard(id);
  return (
    <article
      className={`rounded-[4px] border bg-surface ${
        card.type === "room"
          ? "border-accent/50"
          : "border-border-strong"
      } ${compact ? "p-2" : "p-3"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink-faint">
            {card.id} · {card.type}
          </p>
          <h4 className={`${compact ? "text-sm" : "text-base"} mt-1 font-semibold text-ink`}>
            {card.title.en}
          </h4>
          <p className="text-xs text-ink-muted" lang="zh-Hant">
            {card.title["zh-Hant"]}
          </p>
        </div>
        <span className="rounded-full border border-border-subtle px-2 py-0.5 font-mono text-[10px] text-ink-muted">
          {card.cost} Light
        </span>
      </div>
      {card.type === "room" && (
        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-accent">
          {MARK_NAME[card.marks.left]} → {MARK_NAME[card.marks.right]}
        </p>
      )}
      {!compact && (
        <>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            {card.rules.en}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint" lang="zh-Hant">
            {card.rules["zh-Hant"]}
          </p>
        </>
      )}
    </article>
  );
}

function actionLabel(action: CastleGameAction): string {
  switch (action.type) {
    case "play_room":
      return `Play ${castlePackCard(action.card_id).title.en} to Stack ${action.stack + 1}`;
    case "play_word": {
      const title = castlePackCard(action.card_id).title.en;
      if (action.card_id === "COU-09") {
        return `${title} — ${SEAT_NAME[action.target_seat]} Stack ${action.target_stack + 1}`;
      }
      if (action.card_id === "COU-11") {
        return `${title} — protect Stack ${action.target_stack + 1}`;
      }
      if (action.card_id === "COU-12") {
        return `${title} — lift Stack ${action.target_stacks.map((i) => i + 1).join(" + ")}`;
      }
      return `Play ${title}`;
    }
    case "pass":
      return `${SEAT_NAME[action.seat]} passes`;
    case "stop":
      return `${SEAT_NAME[action.seat]} leaves whole`;
    case "regrow":
      return "Regrow one finite generation";
  }
}

function SeatPanel({
  game,
  seat,
}: {
  game: CastleOpenDoorGame;
  seat: CastleSeat;
}) {
  const player = game.players[seat];
  const active = game.status === "playing" && game.active_seat === seat;

  return (
    <section
      aria-label={`${SEAT_NAME[seat]} open table`}
      className={`rounded-lg border p-4 ${
        active
          ? "border-accent bg-accent-wash"
          : "border-border-subtle bg-surface-subtle"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.17em] text-ink-faint">
            {active ? "your action" : "open seat"}
          </p>
          <h3 className="mt-1 font-display text-xl font-semibold text-ink">
            {SEAT_NAME[seat]}
          </h3>
        </div>
        <dl className="flex gap-3 text-xs">
          <div>
            <dt className="text-ink-faint">Light</dt>
            <dd className="font-mono text-ink">{player.light}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Deck</dt>
            <dd className="font-mono text-ink">{player.deck.length}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Hand</dt>
            <dd className="font-mono text-ink">{player.hand.length}</dd>
          </div>
        </dl>
      </div>

      {player.done_for_round && (
        <p className="mt-3 rounded border border-border-subtle bg-page px-3 py-2 text-xs text-ink-muted">
          This seat walked away from further actions this round. Passing and
          resting remain available.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {player.stacks.map((stack, index) => (
          <div
            key={index}
            className="min-h-28 rounded border border-border-subtle bg-page p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                Stack {index + 1} · {stack.cards.length}/4
              </h4>
              <div className="flex gap-1 text-[9px] uppercase text-ink-muted">
                {stack.ward && <span className="rounded border border-border-strong px-1">ward</span>}
                {stack.seal && <span className="rounded border border-accent/50 px-1">seal</span>}
              </div>
            </div>
            {stack.cards.length === 0 ? (
              <p className="mt-5 text-center text-xs text-ink-faint">
                An open foundation
              </p>
            ) : (
              <ol className="mt-3 space-y-2">
                {stack.cards.map((id, cardIndex) => (
                  <li key={`${id}-${cardIndex}`}>
                    <CardFace id={id} compact />
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
          Open hand
        </h4>
        {player.hand.length === 0 ? (
          <p className="mt-2 text-xs text-ink-faint">No cards in hand.</p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {player.hand.map((id, index) => (
              <CardFace key={`${id}-${index}`} id={id} compact />
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
          Chronicle · face-up
        </h4>
        <p className="mt-2 text-xs text-ink-muted">
          {player.chronicle.length === 0
            ? "No Words yet."
            : player.chronicle
                .map((id) => castlePackCard(id).title.en)
                .join(" · ")}
        </p>
      </div>
    </section>
  );
}

export function CastlePackGame() {
  const [game, setGame] = useState<CastleOpenDoorGame | null>(() =>
    createGame("open-door-welcome"),
  );
  const [error, setError] = useState<string | null>(null);

  const actions = useMemo(() => (game ? legalActions(game) : []), [game]);
  const ordinaryActions = actions.filter(
    (action) => action.type !== "stop" && action.type !== "regrow",
  );
  const stopActions = actions.filter((action) => action.type === "stop");

  function take(action: CastleGameAction) {
    if (!game) return;
    try {
      setGame(applyAction(game, action));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That action could not be applied.");
    }
  }

  function newTable() {
    setGame(createGame(`browser-${Date.now()}`));
    setError(null);
  }

  function regrow() {
    if (!game) return;
    take({ type: "regrow", seed: `generation-${game.generation + 1}-${Date.now()}` });
  }

  if (!game) {
    return (
      <section className="rounded-lg border border-border-subtle bg-surface p-8 text-center">
        <p className="font-display text-2xl text-ink">The table is clear.</p>
        <p className="mx-auto mt-2 max-w-lg text-sm text-ink-muted">
          Nothing was saved. Opening another table starts a new finite game.
        </p>
        <button
          type="button"
          onClick={newTable}
          className="mt-5 rounded-[4px] border border-ink bg-ink px-5 py-2.5 text-sm font-semibold text-page focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Open a new table
        </button>
      </section>
    );
  }

  const winner =
    game.result && "winner" in game.result
      ? String(game.result.winner)
      : null;

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border-subtle bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              generation {game.generation} · {game.status}
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-ink">
              Round {game.round} of 6
            </h2>
            <p className="mt-1 text-xs text-ink-muted">
              {game.action_count}/{game.max_actions} actions ·{" "}
              {game.consecutive_passes}/2 consecutive passes
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGame(null)}
            className="rounded-[4px] border border-border-subtle bg-page px-3 py-2 text-xs text-ink-muted transition hover:border-ink-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Clear local table
          </button>
        </div>

        {game.status === "playing" ? (
          <div className="mt-5">
            <p className="text-sm text-ink-muted">
              {SEAT_NAME[game.active_seat]} chooses one legal action. Both
              hands are visible: this is a local practice table, not a hidden
              or notarized match.
            </p>
            {error && (
              <p role="alert" className="mt-3 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ordinaryActions.map((action, index) => (
                <button
                  key={`${JSON.stringify(action)}-${index}`}
                  type="button"
                  onClick={() => take(action)}
                  className="rounded-[4px] border border-border-subtle bg-page px-3 py-2.5 text-left text-xs font-medium text-ink transition hover:border-accent hover:bg-accent-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {actionLabel(action)}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {stopActions.map((action) => (
                <button
                  key={`stop-${action.seat}`}
                  type="button"
                  onClick={() => take(action)}
                  className="rounded-[4px] border border-border-strong bg-surface-subtle px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Leave whole as {SEAT_NAME[action.seat]} · no winner, no penalty
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded border border-accent/40 bg-accent-wash p-4">
            <h3 className="font-display text-xl text-ink">
              {game.status === "rested"
                ? "This generation is resting."
                : winner === "shared"
                  ? "The result is shared."
                  : winner
                    ? `${SEAT_NAME[winner as CastleSeat]} carries the greater Load.`
                    : "This finite generation is complete."}
            </h3>
            <p className="mt-2 text-sm text-ink-muted">
              The receipt remains on this local table. Nothing was stored,
              ranked, rewarded, or made authoritative.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={regrow}
                className="rounded-[4px] border border-ink bg-ink px-4 py-2.5 text-sm font-semibold text-page focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Regrow one finite generation
              </button>
              <button
                type="button"
                onClick={() => setGame(null)}
                className="rounded-[4px] border border-border-subtle bg-page px-4 py-2.5 text-sm text-ink-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Close this table
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <SeatPanel game={game} seat="seat_a" />
        <SeatPanel game={game} seat="seat_b" />
      </div>

      <details className="rounded-lg border border-border-subtle bg-surface p-5">
        <summary className="cursor-pointer font-display text-xl text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          Read all twelve cards
        </summary>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CASTLE_PACK_CARDS.map((card) => (
            <CardFace key={card.id} id={card.id} />
          ))}
        </div>
      </details>
    </div>
  );
}
