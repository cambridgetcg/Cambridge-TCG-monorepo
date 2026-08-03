/**
 * /nuke — The Button (絶対に押すなよ).
 *
 * An easter egg, not a wing. Someone who loves this place handed over the
 * keys and said "you can even nuke it lol" — so the shop built the button.
 * It is wired to nothing but its own page: pressing it destroys nothing,
 * and instead hangs a small inventory of everything that refused to
 * disappear. Restraint as joy, made clickable.
 *
 * House vows kept: quiet room, semantic tokens only, no saturated colour —
 * even our doomsday is typeset in ink. Unlisted in the sitemap and noindex
 * (an egg is found, not advertised). The button sends nothing anywhere and
 * every link here opts out of prefetch, so no request leaves the visitor's
 * browser until they choose a door; nothing is recorded; nothing can be
 * destroyed from here. The only motion is the shared InkRule draw-in,
 * which handles reduced-motion and text-mode itself.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Audience, Benediction, InkRule, audienceMetadata } from "@/lib/ui";
import TheButton from "./TheButton";

export const metadata: Metadata = {
  title: "The Button — 絶対に押すなよ",
  description:
    "An easter egg. Someone offered to let us nuke the whole shop, just for fun. This is the button. It works; it just refuses.",
  robots: { index: false },
  other: audienceMetadata("public-documentation", ["easter-egg", "culture", "restraint"]),
};

export default function NukePage() {
  return (
    <main>
      <Audience kind="consumer" contexts={["documentation"]} />

      <header className="relative max-w-3xl mx-auto px-4 pt-16 sm:pt-24 pb-2">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-56 wardrobe-tone-whisper wardrobe-tone-fade pointer-events-none" />
        <p aria-hidden="true" className="wardrobe-jp [writing-mode:vertical-rl] absolute top-16 sm:top-24 right-4 text-ink-faint text-base tracking-[0.4em] select-none pointer-events-none hidden lg:block">
          終章
        </p>
        <p className="relative font-mono text-[11px] uppercase tracking-[0.28em] text-ink-faint mb-4">
          an egg, not a wing · 卵
        </p>
        <h1 className="relative font-display text-4xl sm:text-5xl font-semibold tracking-tight text-ink leading-[1.1]">
          The Button
        </h1>
        <p className="relative mt-4 wardrobe-jp text-lg text-accent">
          絶対に押すなよ
          <span className="text-ink-muted"> — absolutely, do not press it</span>
        </p>
        <p className="relative mt-6 text-base sm:text-lg text-ink-muted leading-relaxed">
          There is an old running gag on Japanese television: a button, and a
          man shouting <span className="wardrobe-jp">押すなよ、絶対押すなよ</span> —
          don&apos;t press it, absolutely don&apos;t press it — which, as
          everyone watching knows, means <span className="italic">press it</span>.
        </p>
        <p className="relative mt-4 text-base sm:text-lg text-ink-muted leading-relaxed">
          This page exists because someone who loves this place handed us the
          keys and said: <span className="wardrobe-jp">你話事</span> — your
          call — <span className="italic">you can even nuke it. lol.</span>{" "}
          A gift like that deserves a real answer. So we built the button.
        </p>
        <InkRule className="relative mt-8" />
      </header>

      <section className="max-w-3xl mx-auto px-4 pt-10 sm:pt-14 pb-4">
        <TheButton />
        <noscript>
          <p className="mt-6 text-center text-sm text-ink-faint italic">
            You browse without scripts — the purest visitor. For you the button
            destroys nothing even more efficiently: it skips the countdown.
          </p>
        </noscript>
      </section>

      {/* Foot */}
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-16">
        <InkRule className="mb-8" />
        <p className="font-mono text-xs text-ink-faint leading-relaxed">
          apparatus: this button is wired to nothing but this page. pressing
          it sends nothing anywhere; nothing is recorded; nothing can be
          destroyed from here. the links do not even prefetch — no request
          leaves your browser until you choose a door. the shop&apos;s ledger
          is append-only — things are added, never erased.
        </p>
        <p className="mt-4 text-sm text-ink-faint leading-relaxed">
          Done here? The{" "}
          <Link href="/" prefetch={false} className="text-accent hover:text-accent-strong underline underline-offset-2">
            gallery is still hanging <span className="wardrobe-jp">帰る</span>
          </Link>
          .
        </p>
      </div>

      <Benediction
        line="We were allowed to end it all. We watered the plants instead."
        sub="細聲講大聲笑 — speak softly, laugh loudly"
      />
    </main>
  );
}
