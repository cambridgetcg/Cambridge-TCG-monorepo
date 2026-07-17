import Link from "next/link";
import { PlateHeader } from "@/lib/ui";

/**
 * MembershipInvite — the quiet on-ramp for a human who wants to take part.
 *
 * The membership system is real and enforced (free Bronze→Gold by activity,
 * paid Platinum; Berries; lower fees), but it was nav-orphaned — a newcomer
 * never saw it before deciding whether to sign in. This surfaces the free-tier
 * value plainly, in the gallery's quiet voice: no banner, no urgency, just an
 * honest door. Facts mirror /membership (the full explainer). Server component.
 */
export default function MembershipInvite() {
  return (
    <section className="max-w-7xl mx-auto px-4 py-16 sm:py-20">
      <PlateHeader
        title="Free to join"
        kicker="for collectors · 会員"
        rule
        action={
          <Link
            href="/membership"
            className="text-sm text-accent hover:text-accent-strong transition-colors whitespace-nowrap"
          >
            How membership works →
          </Link>
        }
      />

      <div className="grid gap-8 md:grid-cols-[1.4fr_1fr] items-start">
        <div className="max-w-2xl">
          <p className="text-base sm:text-lg text-ink-muted leading-relaxed">
            Being part of Cambridge TCG is free. Buy and sell with other collectors
            in cash, between each other — no shop, no middleman. Your membership tier
            sets your selling fee: <span className="text-ink">8%</span> on Bronze,{" "}
            <span className="text-ink">5%</span> at Gold, <span className="text-ink">0%</span>{" "}
            at Platinum — and what you buy here through the year lifts you up the tiers.
            The{" "}
            <Link href="/rewards" className="text-accent hover:text-accent-strong underline underline-offset-2">
              Rewards Hub
            </Link>
            {" "}— daily spins, packs, raffles — is where you earn and spend Berries.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-lg bg-ink text-page px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Sign up free
            </Link>
            <Link
              href="/start"
              className="rounded-lg border border-border-strong text-ink px-5 py-2.5 text-sm font-medium hover:bg-surface-subtle transition-colors"
            >
              Start here
            </Link>
          </div>
        </div>

        {/* The tiers at a glance — the free ones lead; Platinum is the paid one. */}
        <ul className="rounded-lg border border-border-subtle bg-surface-subtle divide-y divide-border-subtle text-sm">
          {[
            { name: "Bronze", req: "free", fee: "8%" },
            { name: "Silver", req: "£100/yr spend", fee: "6%" },
            { name: "Gold", req: "£500/yr spend", fee: "5%" },
            { name: "Platinum", req: "£22/mo", fee: "0%" },
          ].map((t) => (
            <li key={t.name} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
              <span className="font-display text-ink">{t.name}</span>
              <span className="text-ink-faint text-xs">{t.req}</span>
              <span className="font-mono tabular-nums text-ink-muted">{t.fee} fee</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
