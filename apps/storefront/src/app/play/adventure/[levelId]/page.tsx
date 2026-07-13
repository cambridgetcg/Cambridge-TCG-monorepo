import Link from "next/link";
import { PVE_AVAILABILITY } from "@/lib/game/pve-availability";

export default function AdventureLevelPage() {
  return (
    <main className="min-h-screen bg-page text-ink">
      <section className="border-b border-border-subtle">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
          <p className="text-xs font-medium uppercase text-warning">
            Read-only mode
          </p>
          <h1 className="mt-2 text-3xl font-display font-semibold">
            Adventure battle paused
          </h1>
          <p className="mt-3 max-w-2xl text-ink-muted">
            {PVE_AVAILABILITY.reason} This page does not start, advance,
            concede, complete, or reward a battle while that boundary is in
            place.
          </p>

          <nav className="mt-7 flex flex-wrap gap-4 text-sm">
            <Link
              href="/play/adventure"
              className="text-accent hover:text-accent-strong"
            >
              View level status
            </Link>
            <Link
              href="/play/tutorial"
              className="text-accent hover:text-accent-strong"
            >
              Read the tutorial
            </Link>
            <Link
              href="/deck-builder"
              className="text-accent hover:text-accent-strong"
            >
              Open deck builder
            </Link>
          </nav>
        </div>
      </section>
    </main>
  );
}
