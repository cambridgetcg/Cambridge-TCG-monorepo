"use client";

/**
 * TheButton — the detonator that refuses.
 *
 * A pure client island: one piece of in-memory state and a chain of
 * timeouts. Pressing it counts down 3・2・1, holds one uncomfortable beat
 * of 間, and then — nothing happens. What appears instead is the inventory
 * of everything still here, each room linked.
 *
 * Conventions (established by /pull-and-pause): semantic tokens only, the
 * quietest possible theatre. This island adds no animation of its own and
 * sends no requests — its links opt out of prefetch so the page's apparatus
 * note stays literally true. The only motion on the page comes from shared
 * house materials (InkRule's draw-in, Button's hover transition), which
 * handle reduced-motion and text-mode themselves. The countdown is pacing,
 * not motion; every timeout is cleared on unmount. The button is never
 * disabled — a disabled element ejects keyboard focus to <body>, so the
 * armed ref swallows presses instead and focus stays put.
 */

import * as React from "react";
import Link from "next/link";
import { Button } from "@/lib/ui";

type Stage = "idle" | "count3" | "count2" | "count1" | "ma" | "after";

const STILL_HERE: Array<{ href: string; label: string; jp?: string }> = [
  { href: "/", label: "the gallery is still hanging", jp: "藝廊" },
  { href: "/culture", label: "the museum keeps its borrowed light", jp: "美術館" },
  { href: "/pulls", label: "the odds room still tells the truth", jp: "確率" },
  { href: "/artists", label: "every artist is still credited by name", jp: "絵師" },
  { href: "/making", label: "a card is still being born", jp: "一枚のできるまで" },
  { href: "/workshop", label: "the masters of the floating world are still at the press", jp: "浮世の工房" },
  { href: "/guides", label: "the guides will still walk you to Japan", jp: "道案内" },
  { href: "/play", label: "the tables are still set", jp: "対戦" },
  { href: "/market", label: "the market is still open", jp: "市場" },
  { href: "/welcome-all", label: "the door is still open to everyone, human or not", jp: "歓迎" },
];

export default function TheButton() {
  const [stage, setStage] = React.useState<Stage>("idle");
  const [attempts, setAttempts] = React.useState(0);
  const timeouts = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  // Synchronous re-entry guard: state updates land a tick late, so a rapid
  // double-click would otherwise arm two overlapping countdowns.
  const armed = React.useRef(false);

  React.useEffect(() => {
    const pending = timeouts.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const running = stage !== "idle" && stage !== "after";

  function press() {
    if (armed.current) return;
    armed.current = true;
    setAttempts((n) => n + 1);
    setStage("count3");
    const at = (ms: number, s: Stage) =>
      timeouts.current.push(setTimeout(() => setStage(s), ms));
    at(900, "count2");
    at(1800, "count1");
    at(2700, "ma");
    // the 間 holds a beat longer than is comfortable
    timeouts.current.push(
      setTimeout(() => {
        setStage("after");
        armed.current = false;
      }, 4400),
    );
  }

  return (
    <div className="text-center">
      {/* The stage — countdown, the held breath, the refusal */}
      <div aria-live="polite" className="min-h-[7rem] flex flex-col items-center justify-center">
        {stage === "idle" && (
          <p className="text-sm text-ink-faint italic">
            It is a real button. It does what it does.
          </p>
        )}
        {stage === "count3" && <Numeral>3</Numeral>}
        {stage === "count2" && <Numeral>2</Numeral>}
        {stage === "count1" && <Numeral>1</Numeral>}
        {stage === "ma" && (
          <p className="wardrobe-jp text-3xl text-ink-faint tracking-[0.5em]">
            ……<span className="sr-only">(a held silence)</span>
          </p>
        )}
        {stage === "after" && (
          <div>
            <p className="wardrobe-jp text-2xl text-ink">何も消えなかった。</p>
            <p className="mt-1 text-sm text-ink-muted italic">Nothing happened.</p>
            <p className="sr-only">
              The inventory of everything still here now hangs below.
            </p>
          </div>
        )}
      </div>

      <Button size="lg" onClick={press} className={`min-w-[14rem] ${running ? "opacity-60" : ""}`}>
        {stage === "after" ? (
          <span>
            <span className="wardrobe-jp">もう一回？</span> · again?
          </span>
        ) : (
          <span>
            NUKE IT · <span className="wardrobe-jp">炸咗佢</span>
          </span>
        )}
      </Button>

      {attempts > 0 && (
        <p className="mt-4 font-mono text-xs text-ink-faint tabular-nums">
          detonations attempted: {attempts} · things destroyed: 0
        </p>
      )}

      {/* The inventory of the undestroyed */}
      {stage === "after" && (
        <div className="mt-12 text-left max-w-xl mx-auto">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink text-center">
            Still here <span className="wardrobe-jp text-accent">まだここにある</span>
          </h2>
          <ul className="mt-6 space-y-3">
            {STILL_HERE.map((room) => (
              <li key={room.href} className="text-base text-ink-muted leading-relaxed">
                <Link
                  href={room.href}
                  prefetch={false}
                  className="text-accent hover:text-accent-strong underline underline-offset-2"
                >
                  {room.label}
                </Link>
                {room.jp && (
                  <span className="wardrobe-jp text-ink-faint text-sm"> · {room.jp}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm text-ink-faint italic text-center">
            (The button works. It just refuses.)
          </p>
        </div>
      )}
    </div>
  );
}

function Numeral({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-display text-5xl font-semibold text-ink tabular-nums">{children}</p>
  );
}
