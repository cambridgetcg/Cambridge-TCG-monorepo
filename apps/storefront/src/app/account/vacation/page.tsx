"use client";

import { useEffect, useState } from "react";
import { Badge, Palettes } from "@/lib/ui";
import { formatDateTime } from "@/lib/format";

import { Audience } from "@/lib/ui";
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

const STATUS_LABELS: Record<Vacation["status"], string> = {
  scheduled: "Scheduled",
  active:    "Active",
  ended:     "Ended",
  cancelled: "Cancelled",
};

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
      <Audience kind="consumer" />
      <h1 className="text-2xl font-display font-semibold text-ink mb-2">Vacation Mode</h1>
      <p className="text-sm text-ink-muted mb-6">
        Step away without breaking your response-window contracts. While active, your asks
        are paused (excluded from matching) and the deadlines on in-flight offers, returns,
        and cancellation requests are pushed back by the duration of your vacation.
      </p>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 mb-4 text-sm text-danger">
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

      <h2 className="text-sm font-bold text-ink-muted mb-2 uppercase tracking-wide mt-8">History</h2>
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : vacations.length === 0 ? (
        <p className="text-xs text-ink-faint">No vacations on record yet.</p>
      ) : (
        <div className="space-y-2">
          {vacations.map((v) => (
            <div key={v.id} className="bg-surface rounded-lg p-3 border border-border-subtle">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-ink text-sm font-semibold">
                    {formatDateTime(v.starts_at)} → {formatDateTime(v.ends_at)}
                  </p>
                  <p className="text-xs text-ink-faint mt-0.5">
                    Duration {durationLabel(v.starts_at, v.ends_at)}
                    {v.message && (
                      <>
                        <span className="mx-1.5">·</span>
                        <span className="italic">“{v.message}”</span>
                      </>
                    )}
                  </p>
                </div>
                <Badge status={v.status} palette={Palettes.VacationStatusPalette} labels={STATUS_LABELS} />
              </div>
            </div>
          ))}
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
  // Quiet-gallery semantic tokens only — the previous `bg-${tone}-500/10`
  // string interpolation both broke the house palette rule and produced
  // classes Tailwind never generated (so the banner rendered unstyled).
  const surface = isActive
    ? "bg-warning/10 border-warning/30"
    : "bg-info/10 border-info/30";
  const heading = isActive ? "text-warning" : "text-info";

  return (
    <div className={`${surface} border rounded-lg p-5 mb-6`}>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className={`text-sm font-bold uppercase tracking-wide ${heading}`}>
          {isActive ? "On vacation now" : "Vacation scheduled"}
        </h2>
        <span className="text-xs text-ink-muted">
          {formatDateTime(current.starts_at)} → {formatDateTime(current.ends_at)}
        </span>
      </div>
      <p className="text-sm text-ink-muted mb-3">
        {isActive
          ? "Your asks are paused and won't match new bids. Offer/return/cancel response windows on in-flight items have been extended by your vacation duration."
          : `Starting ${formatDateTime(current.starts_at)}. Until then, everything operates normally.`}
      </p>
      {current.message && (
        <p className="text-xs text-ink-muted italic mb-3 bg-surface-subtle rounded p-2">
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
          className="px-3 py-1.5 text-xs font-medium bg-surface-subtle text-ink-muted rounded-md hover:bg-surface-subtle transition disabled:opacity-50"
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
          className="px-3 py-1.5 text-xs font-medium bg-danger/15 text-danger border border-danger/30 rounded-md hover:bg-danger/15 transition disabled:opacity-50"
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
    <div className="bg-surface rounded-lg p-5 border border-accent/30">
      <h2 className="text-sm font-bold text-accent uppercase tracking-wide mb-3">Schedule a vacation</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-ink-faint mb-1">Starts</label>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="w-full px-3 py-2 bg-surface-subtle border border-border-subtle rounded-lg text-ink text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-faint mb-1">Ends</label>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="w-full px-3 py-2 bg-surface-subtle border border-border-subtle rounded-lg text-ink text-sm"
          />
        </div>
      </div>
      <label className="block text-xs text-ink-faint mb-1">
        Public message (shown on your profile + listings)
      </label>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Back Mon Dec 18 — expedited shipping after"
        maxLength={200}
        className="w-full px-3 py-2 bg-surface-subtle border border-border-subtle rounded-lg text-ink text-sm mb-3"
      />
      <div className="flex justify-end">
        <button
          disabled={busy}
          onClick={submit}
          className="px-4 py-2 text-xs font-semibold bg-ink text-page rounded-lg hover:opacity-90 transition disabled:opacity-50"
        >
          {busy ? "Scheduling..." : "Schedule vacation"}
        </button>
      </div>
      <p className="text-[10px] text-ink-faint mt-3">
        Min 4 hours · Max 60 days · Must start at least 5 minutes from now
      </p>
    </div>
  );
}
