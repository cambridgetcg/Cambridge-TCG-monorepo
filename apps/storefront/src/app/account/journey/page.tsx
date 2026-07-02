"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Audience } from "@/lib/ui";
interface Event {
  kind: string;
  summary: string;
  at: string;
  link: string | null;
  group: string;
  tone: string;
}

const GROUP_TABS = [
  { key: "all",          label: "All" },
  { key: "vault",        label: "Vault" },
  { key: "prize",        label: "Prizes" },
  { key: "trade",        label: "Trades" },
  { key: "draw",         label: "Pulls & draws" },
  { key: "review",       label: "Reviews" },
  { key: "external_rep", label: "External rep" },
  { key: "payment",      label: "Payments" },
  { key: "admin",        label: "Account" },
] as const;

const TONE: Record<string, string> = {
  emerald: "border-emerald-500/30 bg-emerald-500/5",
  amber:   "border-accent/30 bg-accent/5",
  red:     "border-danger/30 bg-danger/5",
  sky:     "border-sky-500/30 bg-sky-500/5",
  fuchsia: "border-fuchsia-500/30 bg-fuchsia-500/5",
  default: "border-border-subtle bg-surface",
};

const TONE_DOT: Record<string, string> = {
  emerald: "bg-emerald-400",
  amber:   "bg-accent-strong",
  red:     "bg-red-400",
  sky:     "bg-sky-400",
  fuchsia: "bg-fuchsia-400",
  default: "bg-neutral-600",
};

export default function AccountJourneyPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<typeof GROUP_TABS[number]["key"]>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const url = new URL("/api/account/journey", window.location.origin);
    if (tab !== "all") url.searchParams.set("group", tab);
    const r = await fetch(url.toString());
    if (r.ok) setEvents((await r.json()).events ?? []);
    setLoading(false);
  }, [tab]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <Audience kind="consumer" />
      <h1 className="text-2xl font-bold text-ink mb-2">Activity</h1>
      <p className="text-sm text-ink-muted mb-6">
        A unified timeline of everything you&apos;ve done on the platform —
        every trade, pull, review, prize ship, and payment event.
        Each row links back to its source.
      </p>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {GROUP_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-lg transition-colors ${
              tab === t.key ? "bg-accent text-black font-bold"
                : "bg-surface text-ink-muted hover:text-ink hover:bg-surface-elevated"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-ink-faint">Loading…</p>
      ) : events.length === 0 ? (
        <div className="bg-surface border border-border-subtle rounded-xl p-6 text-center text-ink-faint text-sm">
          {tab === "all"
            ? "No activity recorded yet. Place a trade or open a pull to get started."
            : `No ${GROUP_TABS.find(t => t.key === tab)?.label.toLowerCase()} activity yet.`}
        </div>
      ) : (
        <ol className="relative border-l border-border-subtle ml-3 space-y-2">
          {events.map((e, i) => {
            const tone = TONE[e.tone] ?? TONE.default;
            const dot = TONE_DOT[e.tone] ?? TONE_DOT.default;
            const day = new Date(e.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
            const time = new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
            return (
              <li key={`${e.kind}-${i}`} className="ml-4 relative">
                <span className={`absolute -left-[22px] top-3 w-2 h-2 rounded-full ${dot}`} />
                <div className={`rounded-xl border p-3 ${tone}`}>
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <p className="text-sm text-ink">{e.summary}</p>
                    <span className="text-[11px] text-ink-faint whitespace-nowrap">
                      {day} · {time}
                    </span>
                  </div>
                  <p className="text-[10px] text-ink-faint mt-1 font-mono">{e.kind}</p>
                  {e.link && (
                    <Link href={e.link} className="text-[11px] text-accent-strong hover:text-accent-strong underline mt-1 inline-block">
                      View →
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
