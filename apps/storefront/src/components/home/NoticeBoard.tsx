import { WhyLink } from "@/lib/ui";

/**
 * NoticeBoard — a dated, framed notice in the shop room.
 *
 * The sanctioned treatment of the shop's status while the regulator
 * reconciliation (open question, Yu's call) is pending: the copy below
 * claims neither permanence nor closure. The day the direction is ruled,
 * the update is a prop/copy change here — one component, one line.
 * No countdowns, no scarcity theater, ever.
 */
export default function NoticeBoard({ date }: { date: string }) {
  return (
    <div className="wardrobe-mat rounded-xl p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
        Notice · <time dateTime={date}>{date}</time>
      </p>
      <p className="mt-2 text-sm text-ink leading-relaxed">
        The shop is open — real inventory at honest prices. The platform
        around it — prices, market, play — is what we&rsquo;re building
        next.{" "}
        <WhyLink href="/methodology/regulator" label="where this is going" />
      </p>
    </div>
  );
}
