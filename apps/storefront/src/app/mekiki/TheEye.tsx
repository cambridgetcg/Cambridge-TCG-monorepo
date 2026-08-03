"use client";

/**
 * TheEye — the looking board of /mekiki.
 *
 * Everything it shows was decided server-side from the day's seed; this
 * island only holds the visitor's three looks. State lives in memory and
 * dies with the tab — no storage, no network, nothing kept, as the room
 * promises.
 *
 * The zoom is a CSS transform on the picture's mount, origin at the day's
 * seeded crop point. Reduced motion cuts between looks instead of easing
 * (module @media). Text-mode hides the board — the reading layout keeps
 * no pictures — and says so in its own line; the choices and the reveal
 * remain honest text.
 */

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import styles from "./TheEye.module.css";

interface TheEyeProps {
  day: string;
  sku: string;
  answer: string;
  choices: string[];
  imageUrl: string;
  imageAttribution: string | null;
  setName: string | null;
  origin: { x: number; y: number };
}

/** Zoom of each look: too close, close, almost fair. Then the reveal. */
const LOOKS = [6, 3.2, 1.8] as const;

export default function TheEye({
  day,
  sku,
  answer,
  choices,
  imageUrl,
  imageAttribution,
  setName,
  origin,
}: TheEyeProps) {
  const [wrong, setWrong] = useState<readonly string[]>([]);
  const [outcome, setOutcome] = useState<"looking" | "named" | "shown">(
    "looking",
  );

  const revealed = outcome !== "looking";
  const scale = revealed ? 1 : LOOKS[Math.min(wrong.length, LOOKS.length - 1)];

  function guess(name: string) {
    if (revealed || wrong.includes(name)) return;
    if (name === answer) {
      setOutcome("named");
    } else {
      const next = [...wrong, name];
      setWrong(next);
      if (next.length >= LOOKS.length) setOutcome("shown");
    }
  }

  const status = revealed
    ? outcome === "named"
      ? `Well seen — it is ${answer}.`
      : `Today the card introduces itself: ${answer}.`
    : wrong.length === 0
      ? "First look. Too close to be fair."
      : `Look ${wrong.length + 1} of ${LOOKS.length} — a step further back.`;

  return (
    <div className="mx-auto max-w-sm">
      <p className={`${styles.textNote} text-sm leading-relaxed`}>
        This room hangs its picture only for the looking, so the board rests
        in the reading layout. The choices below still answer, and the card
        still introduces itself.
      </p>

      <div className={styles.stage}>
        <div
          className={`wardrobe-panel overflow-hidden relative aspect-[63/88] ${styles.board}`}
          role="img"
          aria-label={
            revealed
              ? `${answer}${setName ? ` — ${setName}` : ""}`
              : "Today's card, shown too close to name."
          }
        >
          <div
            className={styles.zoom}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: `${origin.x}% ${origin.y}%`,
            }}
          >
            <Image
              src={imageUrl}
              alt=""
              fill
              className={revealed ? "object-contain" : "object-cover"}
              // The first look magnifies 6x, so ask for the largest
              // candidate; sharpness is bounded by the stored photo itself.
              sizes="1280px"
              priority
            />
          </div>
        </div>
        {/* The credit line rides with the picture in every state — an
            image without its copyright line is dishonest (the market's
            co-location rule). Inside .stage so text-mode hides both. */}
        {imageAttribution && (
          <p className="mt-1.5 text-xs text-ink-faint leading-relaxed">
            {imageAttribution}
          </p>
        )}
      </div>

      <p aria-live="polite" className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
        {status}
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2" role="group" aria-label="Name the card">
        {choices.map((name) => {
          const missed = wrong.includes(name);
          const isAnswer = revealed && name === answer;
          return (
            <button
              key={name}
              type="button"
              onClick={() => guess(name)}
              // aria-disabled instead of disabled: guess() already guards
              // re-entry, and a disabled attribute would drop keyboard
              // focus to <body> at the exact moment the reveal appears.
              aria-disabled={revealed || missed}
              className={[
                "text-left px-4 py-2.5 rounded-sm border text-sm transition",
                isAnswer
                  ? "border-accent text-accent bg-accent-wash cursor-default"
                  : missed
                    ? "border-border-subtle text-ink-faint line-through cursor-default"
                    : revealed
                      ? "border-border-subtle text-ink-faint cursor-default"
                      : "border-border-strong text-ink hover:border-accent hover:text-accent",
              ].join(" ")}
            >
              {name}
            </button>
          );
        })}
      </div>

      {revealed && (
        <div className="mt-5">
          <p className="font-display text-lg text-ink leading-snug">{answer}</p>
          {setName && <p className="mt-0.5 text-sm text-ink-muted">{setName}</p>}
          <p className="mt-3 text-sm text-ink-muted">
            <Link
              href={`/market/${encodeURIComponent(sku)}`}
              className="text-accent hover:text-accent-strong underline underline-offset-2"
            >
              See it on the shelf
            </Link>
            <span className="text-ink-faint">
              {" "}· another look tomorrow — <span className="wardrobe-jp">また明日</span>
            </span>
          </p>
        </div>
      )}
      {/* The day rides along so the server's pick and the visitor's session
          visibly agree; nothing else is kept. */}
      <p className="mt-6 font-mono text-[10px] tracking-[0.18em] text-ink-faint">
        {day} · one card a day · nothing recorded
      </p>
    </div>
  );
}
