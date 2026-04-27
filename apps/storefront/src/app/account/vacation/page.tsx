"use client";

import { useEffect, useState } from "react";

interface Vacation {
  id: string;
  starts_at: string;
  ends_at: string;
  message: string | null;
  status: "scheduled" | "active" | "ended" | "cancelled";
  applied_at: string | null;
  unapplied_at: string | null;
  created_at: string;
}

const STATUS_BADGE: Record<Vacation["status"], { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  active:    { label: "Active",    className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  ended:     { label: "Ended",     className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cancelled: { label: "Cancelled", className: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function durationLabel(starts: string, ends: string): string {
  const ms = new Date(ends).getTime() - new Date(starts).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  return `${hours}h`;
}

export default function VacationPage() {
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [active, setActive] = useState<Vacation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/account/vacation")
      .then((r) => r.json())
      .then((d) => {
        setVacations(d.vacations || []);
        setActive(d.active ?? null);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function action(path: string, body?: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Action failed");
      else load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-2">Vacation Mode</h1>
      <p className="text-sm text-neutral-400 mb-6">
        Step away without breaking your response-window contracts. While active, your asks
        are paused (excluded from matching) and the deadlines on in-flight offers, returns,
        and cancellation requests are pushed back by the duration of your vacation.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Active / scheduled banner */}
      <ActiveBanner
        vacations={vacations}
        active={active}
        busy={busy}
        onAction={action}
      />

      {!loading && !active && !vacations.some((v) => v.status === "scheduled") && (
        <NewVacationForm busy={busy} onSubmit={(body) => action("/api/account/vacation", body)} />
      )}

      <h2 className="text-sm font-bold text-neutral-400 mb-2 uppercase tracking-wide mt-8">History</h2>
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : vacations.length === 0 ? (
        <p className="text-xs text-neutral-500">No vacations on record yet.</p>
      ) : (
        <div className="space-y-2">
          {vacations.map((v) => {
            const badge = STATUS_BADGE[v.status];
            return (
              <div key={v.id} className="bg-neutral-900 rounded-xl p-3 border border-neutral-800">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold">
                      {fmtDate(v.starts_at)} → {fmtDate(v.ends_at)}
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Duration {durationLabel(v.starts_at, v.ends_at)}
                      {v.message && (
                        <>
                          <span className="mx-1.5">·</span>
                          <span className="italic">“{v.message}”</span>
                        </>
                      )}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActiveBanner({
  vacations,
  active,
  busy,
  onAction,
}: {
  vacations: Vacation[];
  active: Vacation | null;
  busy: boolean;
  onAction: (path: string, body?: object) => void;
}) {
  // The "current" surface is the active row, OR the soonest scheduled row.
  const current = active ?? vacations.find((v) => v.status === "scheduled") ?? null;
  if (!current) return null;

  const isActive = current.status === "active";
  const tone = isActive ? "amber" : "blue";

  return (
    <div className={`bg-${tone}-500/10 border border-${tone}-500/30 rounded-xl p-5 mb-6`}>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className={`text-sm font-bold uppercase tracking-wide text-${tone}-400`}>
          {isActive ? "On vacation now" : "Vacation scheduled"}
        </h2>
        <span className="text-xs text-neutral-400">
          {fmtDate(current.starts_at)} → {fmtDate(current.ends_at)}
        </span>
      </div>
      <p className="text-sm text-neutral-300 mb-3">
        {isActive
          ? "Your asks are paused and won't match new bids. Offer/return/cancel response windows on in-flight items have been extended by your vacation duration."
          : `Starting ${fmtDate(current.starts_at)}. Until then, everything operates normally.`}
      </p>
      {current.message && (
        <p className="text-xs text-neutral-300 italic mb-3 bg-neutral-950/40 rounded p-2">
          Public message: “{current.message}”
        </p>
      )}
      <div className="flex gap-2 flex-wrap">
        <button
          disabled={busy}
          onClick={() => {
            const newEnd = prompt(
              "New end date+time (ISO, e.g. 2026-12-31T23:00). Must be later than the current end.",
              current.ends_at,
            );
            if (newEnd) onAction(`/api/account/vacation/${current.id}/extend`, { newEndsAt: newEnd });
          }}
          className="px-3 py-1.5 text-xs font-medium bg-neutral-800 text-neutral-300 rounded-md hover:bg-neutral-700 transition disabled:opacity-50"
        >
          Extend
        </button>
        <button
          disabled={busy}
          onClick={() => {
            if (confirm(isActive ? "End vacation now? Your asks will go back on the book." : "Cancel scheduled vacation?")) {
              onAction(`/api/account/vacation/${current.id}/end`);
            }
          }}
          className="px-3 py-1.5 text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/25 transition disabled:opacity-50"
        >
          {isActive ? "End vacation now" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

function NewVacationForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (body: object) => void;
}) {
  // Default: starts 1 hour from now, ends 7 days later. Trim seconds
  // so the input renders cleanly.
  const [startsAt, setStartsAt] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [endsAt, setEndsAt] = useState(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [message, setMessage] = useState("");

  function submit() {
    onSubmit({
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      message: message.trim() || undefined,
    });
  }

  return (
    <div className="bg-neutral-900 rounded-xl p-5 border border-amber-500/20">
      <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wide mb-3">Schedule a vacation</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Starts</label>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Ends</label>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm"
          />
        </div>
      </div>
      <label className="block text-xs text-neutral-500 mb-1">
        Public message (shown on your profile + listings)
      </label>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Back Mon Dec 18 — expedited shipping after"
        maxLength={200}
        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm mb-3"
      />
      <div className="flex justify-end">
        <button
          disabled={busy}
          onClick={submit}
          className="px-4 py-2 text-xs font-bold bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
        >
          {busy ? "Scheduling..." : "Schedule vacation"}
        </button>
      </div>
      <p className="text-[10px] text-neutral-600 mt-3">
        Min 4 hours · Max 60 days · Must start at least 5 minutes from now
      </p>
    </div>
  );
}
