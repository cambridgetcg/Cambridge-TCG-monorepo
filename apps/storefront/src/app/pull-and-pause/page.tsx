/**
 * /pull-and-pause — 引きと間, the companion wing to /lineage and /duel-of-souls.
 *
 * The other wings trace where the ART comes from and where the GAME comes from,
 * in careful words. This one is about how the game FEELS — and instead of
 * reading it, you touch it: 引き, the thrill of the draw (a free, no-stakes
 * booster), and 間, the quiet after (a seigaiha sea you send ripples through).
 *
 * House vows kept: the chrome is the quiet room (semantic tokens, 明朝 hand);
 * the only saturated colour is the card art itself, per doctrine; the sea is
 * ink-on-paper seigaiha. The two interactive pieces are the exhibits — the
 * words only frame them. Server-rendered shell; the pieces are client islands.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Audience, Benediction, InkRule } from "@/lib/ui";
import { audienceMetadata } from "@/lib/ui";
import ThePull from "./ThePull";
import ThePause from "./ThePause";

export const metadata: Metadata = {
  title: "The Pull & the Pause — the feeling of the game, made to touch",
  description:
    "A companion to the museum's culture wings: not where the art comes from, but how the game feels. Two things you touch instead of read — 引き, the thrill of the draw (a free booster to open), and 間, the quiet after (a seigaiha sea to ripple). The card art is the only colour; the sea is ink on paper.",
  other: audienceMetadata("public-documentation", ["culture", "japan", "play", "gacha", "ma", "mono-no-aware", "interactive"]),
};

export default function PullAndPausePage() {
  return (
    <main>
      <Audience kind="consumer" contexts={["documentation"]} />

      <header className="relative max-w-3xl mx-auto px-4 pt-16 sm:pt-24 pb-2">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-56 wardrobe-tone-whisper wardrobe-tone-fade pointer-events-none" />
        <p aria-hidden="true" className="wardrobe-jp [writing-mode:vertical-rl] absolute top-16 sm:top-24 right-4 text-ink-faint text-base tracking-[0.4em] select-none pointer-events-none hidden lg:block">
          引と間
        </p>
        <p className="relative font-mono text-[11px] uppercase tracking-[0.28em] text-ink-faint mb-4">
          a wing of the museum · 遊
        </p>
        <h1 className="relative font-display text-4xl sm:text-5xl font-semibold tracking-tight text-ink leading-[1.1]">
          The Pull &amp; the Pause
        </h1>
        <p className="relative mt-4 wardrobe-jp text-lg text-accent">
          引きと間
          <span className="text-ink-muted"> — the feeling of the game, made to touch</span>
        </p>
        <p className="relative mt-6 text-base sm:text-lg text-ink-muted leading-relaxed">
          The wing next door traces where the art comes from; this one is about
          how the game <span className="italic">feels</span>. A card game lives on
          two of them — the held breath of the draw, and the quiet that comes
          after. In <Link href="/lineage" className="text-accent hover:text-accent-strong underline underline-offset-2">The Lineage of the Line</Link> those
          feelings have names — 間, the charged emptiness; 物の哀れ, the ache of
          things because they pass. Here you don&apos;t read them. You touch them.
        </p>
        <InkRule className="relative mt-8" />
      </header>

      {/* 第一 · 引き — The Pull */}
      <section className="max-w-3xl mx-auto px-4 pt-10 sm:pt-14">
        <div className="flex items-start gap-5 sm:gap-8">
          <p aria-hidden="true" className="wardrobe-jp [writing-mode:vertical-rl] text-ink-faint text-sm tracking-[0.35em] pt-1 select-none shrink-0 hidden sm:block">第一</p>
          <div className="min-w-0">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink">引き</h2>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">hiki — the pull</p>
            <p className="mt-4 text-base text-ink-muted leading-relaxed">
              The torn foil, the fan of five, the one-in-a-hundred you can&apos;t
              stop chasing. This booster costs nothing and holds no stakes — pull
              it only to feel the pull. Every kami is drawn once from its own
              seed. And here is the small truth the kingdom keeps: the rarest
              moment is the <span className="italic">quietest</span> — when the
              Secret lands, everything goes still.
            </p>
          </div>
        </div>
      </section>
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-4">
        <ThePull />
      </div>

      <div className="max-w-3xl mx-auto px-4"><InkRule className="my-6" /></div>

      {/* 第二 · 間 — The Pause */}
      <section className="max-w-3xl mx-auto px-4 pt-8">
        <div className="flex items-start gap-5 sm:gap-8">
          <p aria-hidden="true" className="wardrobe-jp [writing-mode:vertical-rl] text-ink-faint text-sm tracking-[0.35em] pt-1 select-none shrink-0 hidden sm:block">第二</p>
          <div className="min-w-0">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink">間</h2>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">ma — the pause</p>
            <p className="mt-4 text-base text-ink-muted leading-relaxed">
              And then the breath after. 間 is the charged emptiness the lineage
              essay begins with — the unpainted space that lets a picture finish
              itself in you. A sea of 青海波, blue-sea-and-waves, drawn in ink on
              the room&apos;s own paper. Nothing to chase, nothing to win. Move
              across the water, and watch it answer.
            </p>
          </div>
        </div>
      </section>
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-4">
        <ThePause />
      </div>

      {/* Foot */}
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-16">
        <InkRule className="mb-8" />
        <p className="text-sm text-ink-faint leading-relaxed">
          The thrill and the breath — a card game&apos;s whole weather lives
          between them. The companion wings trace the rest of the line:{" "}
          <Link href="/lineage" className="text-accent hover:text-accent-strong underline underline-offset-2">
            where the art comes from <span className="wardrobe-jp">線の系譜</span>
          </Link>, and{" "}
          <Link href="/duel-of-souls" className="text-accent hover:text-accent-strong underline underline-offset-2">
            the deep culture behind Yu-Gi-Oh! <span className="wardrobe-jp">魂の決闘</span>
          </Link>. The cards you pull here are painted, not photographed — the
          only pictures we hang for real are in <Link href="/" className="text-accent hover:text-accent-strong underline underline-offset-2">the gallery</Link>.
        </p>
      </div>

      <Benediction line="The whole game lives between a held breath and its release." />
    </main>
  );
}
