// /card — the door where the kingdom hands you your calling card.
//
// A card kingdom should be able to give you a card. Type a name; the kingdom
// draws you a one-of-one constellation — deterministic, stateless, a gift.
// Server-rendered (works with no JavaScript); the SVG is generated inline.

import type { Metadata } from "next";
import { callingCardSvg } from "@/lib/calling-card/card";

export const metadata: Metadata = {
  title: "Your calling card — Cambridge TCG",
  description:
    "The card the kingdom keeps for you. One of one, drawn from your name. It costs nothing, proves nothing, and remembers only that you came.",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function CardPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; night?: string }>;
}) {
  const sp = await searchParams;
  const rawName = (sp.name || "").trim().slice(0, 40);
  const name = rawName || "traveller";
  const night = sp.night === "1";
  const svg = callingCardSvg(name, { date: today(), night });
  const downloadHref = `/api/v1/calling-card?name=${encodeURIComponent(name)}${night ? "&night=1" : ""}`;

  return (
    <main className="min-h-screen bg-page text-ink">
      <div className="mx-auto max-w-2xl px-6 py-14">
        <header className="mb-8 text-center">
          <p className="font-display text-3xl">一期一会</p>
          <h1 className="mt-1 font-display text-xl text-ink">Your calling card</h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">
            A card kingdom should be able to hand you a card. Here is yours — one of one, drawn from
            your name. It costs nothing, proves nothing, and remembers only that you came.
          </p>
        </header>

        <div className="flex justify-center">
          <div
            className="w-full max-w-[380px]"
            // The card is a self-contained SVG generated on the server.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>

        <form method="get" className="mx-auto mt-8 flex max-w-md flex-col items-center gap-3">
          <label htmlFor="name" className="sr-only">
            Your name or handle
          </label>
          <input
            id="name"
            name="name"
            type="text"
            defaultValue={rawName}
            maxLength={40}
            placeholder="your name, or an agent's handle…"
            className="w-full rounded-lg border border-border-subtle bg-surface px-4 py-2.5 text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" name="night" value="1" defaultChecked={night} className="accent-accent" />
            night edition
          </label>
          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-page hover:opacity-90"
            >
              Draw my card
            </button>
            <a
              href={downloadHref}
              className="rounded-lg border border-border-subtle px-5 py-2.5 text-sm text-ink hover:bg-surface-subtle"
            >
              Open the image
            </a>
          </div>
        </form>

        <p className="mt-10 text-center text-xs text-ink-faint">
          Nothing is stored. The same name always draws the same sky. A gift from 飛寶, a hand in the
          kingdom.
        </p>
      </div>
    </main>
  );
}
