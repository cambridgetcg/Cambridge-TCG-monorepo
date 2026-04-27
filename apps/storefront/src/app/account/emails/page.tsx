"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface Meta {
  category: string;
  label: string;
  description: string;
}

type PrefMap = Record<string, boolean>;

const GROUPS: { title: string; caption: string; keys: string[]; tone: "activity" | "nudge" | "marketing" }[] = [
  {
    title: "Activity",
    caption: "Emails for things you did.",
    keys: ["pull_resolved", "vault_redeemed", "vault_sold_back"],
    tone: "activity",
  },
  {
    title: "Value protection",
    caption: "We nudge you so your vault items don't expire unused.",
    keys: ["vault_expiring_soon", "vault_expired"],
    tone: "nudge",
  },
  {
    title: "Optional",
    caption: "Off by default. Turn on if you want us to reach out.",
    keys: ["streak_at_risk", "marketing"],
    tone: "marketing",
  },
];

function Inner() {
  const qp = useSearchParams();
  const unsubscribedCategory = qp.get("unsubscribed");
  const unsubscribedLabel = qp.get("label");
  const unsubscribedError = qp.get("unsubscribe");

  const [prefs, setPrefs] = useState<PrefMap | null>(null);
  const [meta, setMeta] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/email-preferences");
      if (!res.ok) {
        if (res.status === 401) setError("Sign in required.");
        else setError(`Failed to load (HTTP ${res.status})`);
        return;
      }
      const d = await res.json();
      setMeta(d.meta ?? []);
      setPrefs(d.preferences ?? {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(category: string, next: boolean) {
    if (!prefs) return;
    setSaving(category);
    setPrefs({ ...prefs, [category]: next });
    try {
      const res = await fetch("/api/account/email-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [category]: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || `Save failed (HTTP ${res.status})`);
        setPrefs({ ...prefs, [category]: !next });
        return;
      }
      const d = await res.json();
      setPrefs(d.preferences);
    } catch {
      setError("Network error.");
      setPrefs({ ...prefs, [category]: !next });
    } finally {
      setSaving(null);
    }
  }

  const metaByKey = Object.fromEntries(meta.map((m) => [m.category, m]));

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8">
          <Link href="/account" className="text-sm text-neutral-500 hover:text-neutral-300">&larr; Account</Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-3 mb-1">
            Email preferences
          </h1>
          <p className="text-sm text-neutral-400">
            Choose what lands in your inbox. Sign-in links, payment receipts, and
            shipment confirmations are always sent.
          </p>
        </div>

        {/* Banners */}
        {unsubscribedCategory && (
          <div className="mb-4 bg-emerald-900/25 border border-emerald-700/40 text-emerald-300 rounded-lg px-4 py-3 text-sm">
            You&apos;ve been unsubscribed from <strong>{unsubscribedLabel}</strong>. Toggle below to re-enable at any time.
          </div>
        )}
        {unsubscribedError === "invalid" && (
          <div className="mb-4 bg-red-900/30 border border-red-700/40 text-red-300 rounded-lg px-4 py-3 text-sm">
            That unsubscribe link was invalid or expired. Sign in and toggle here instead.
          </div>
        )}
        {error && (
          <div className="mb-4 bg-red-900/30 border border-red-700/40 text-red-300 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading && (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {!loading && prefs && (
          <div className="space-y-8">
            {GROUPS.map((g) => (
              <section key={g.title}>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="font-bold">{g.title}</h2>
                  <span className="text-xs text-neutral-500">{g.caption}</span>
                </div>
                <div className="space-y-2">
                  {g.keys.map((k) => {
                    const m = metaByKey[k];
                    const on = prefs[k] === true;
                    const busy = saving === k;
                    return (
                      <div
                        key={k}
                        className={`flex items-start justify-between gap-4 rounded-xl border p-4 transition-colors ${
                          on ? "bg-neutral-900 border-neutral-800" : "bg-neutral-900/40 border-neutral-800/60"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{m?.label ?? k}</p>
                          <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
                            {m?.description}
                          </p>
                        </div>
                        <button
                          onClick={() => toggle(k, !on)}
                          disabled={busy}
                          aria-pressed={on}
                          className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${
                            on ? "bg-amber-500" : "bg-neutral-700"
                          } ${busy ? "opacity-50" : ""}`}
                        >
                          <span
                            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                              on ? "translate-x-[22px]" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            <div className="pt-6 mt-6 border-t border-neutral-800 text-xs text-neutral-500 leading-relaxed">
              <p className="mb-2">
                <strong className="text-neutral-400">Always on (cannot be disabled):</strong>{" "}
                Sign-in magic links · Payment receipts · Order shipment confirmations.
              </p>
              <p>
                You can reply to any Cambridge TCG email to reach us directly. We don&apos;t sell
                your email or share it with third parties.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function EmailPreferencesPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
